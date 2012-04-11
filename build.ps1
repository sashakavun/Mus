
# Mus builder for Windows systems
#
# Copyright 2012, Aleksandr "keta" Kavun
# Licensed under the MIT license:
# http://www.opensource.org/licenses/mit-license.php
#
# Instructions:
#   Right-click on file and select "Run with PowerShell" or open console and run following command:
#     powershell -File "build.ps1"

# Source and destination files
$src = "mus.src.js"
$dst = "mus.js"

# Read Mus source
$source = [System.Io.File]::ReadAllText($src)

# Read Mustache source
$mustache = [System.Io.File]::ReadAllText("mustache.js")

# Replace marker with Mustache source
$marker = New-Object System.Text.RegularExpressions.Regex "\t*//\s+{{mustache}}\s+//"
$result = $marker.Replace($source,$mustache)

# Write result
[System.Io.File]::WriteAllText($dst,$result)
