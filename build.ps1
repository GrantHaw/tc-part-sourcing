# packages both browser builds into dist\
# powershell equivalent of build.sh, for windows boxes without zip.exe
# same source files either way, only the manifest differs

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

# Compress-Archive on windows powershell writes backslash separated entry names,
# which firefox and chrome both choke on. build the archive by hand so every
# entry name uses forward slashes.
function New-ExtArchive {
    param($SrcDir, $OutFile)

    if (Test-Path $OutFile) { Remove-Item $OutFile -Force }

    $src = (Resolve-Path $SrcDir).Path.TrimEnd('\')
    $zip = [System.IO.Compression.ZipFile]::Open($OutFile, 'Create')

    try {
        Get-ChildItem -Path $src -Recurse -File | ForEach-Object {
            # path relative to the build dir, with forward slashes
            $name = $_.FullName.Substring($src.Length + 1).Replace('\', '/')
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $zip, $_.FullName, $name,
                [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally {
        $zip.Dispose()
    }
}

if (Test-Path dist)  { Remove-Item dist  -Recurse -Force }
if (Test-Path build) { Remove-Item build -Recurse -Force }
New-Item -ItemType Directory -Path dist, build | Out-Null

$src = @('icons', 'parsers', 'popup')

# chrome / edge
New-Item -ItemType Directory -Path build\chrome | Out-Null
foreach ($d in $src) { Copy-Item $d build\chrome\ -Recurse }
Copy-Item manifest.json build\chrome\manifest.json
New-ExtArchive -SrcDir build\chrome -OutFile (Join-Path $PWD 'dist\tc-part-sourcing-chrome.zip')

# firefox, xpi is just a zip with a different extension
# the manifest has to be at the archive root, not inside a folder
New-Item -ItemType Directory -Path build\firefox | Out-Null
foreach ($d in $src) { Copy-Item $d build\firefox\ -Recurse }
Copy-Item manifest.firefox.json build\firefox\manifest.json
New-ExtArchive -SrcDir build\firefox -OutFile (Join-Path $PWD 'dist\tc-part-sourcing-firefox.xpi')

Remove-Item build -Recurse -Force
Get-ChildItem dist | Format-Table Name, Length

Write-Host ""
Write-Host "note: the xpi is unsigned. release firefox refuses unsigned xpis."
Write-Host "sign it through addons.mozilla.org (unlisted / self distribution) before handing it out,"
Write-Host "or load it temporarily via about:debugging for testing."
