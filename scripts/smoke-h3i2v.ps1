# After I2V completes: ffprobe + 3 frame grabs. Args: jobId
param([Parameter(Mandatory=$true)][string]$JobId)
$ErrorActionPreference = "Stop"
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
$mp4 = "C:\Users\USER\Grok\apps\AIOSCreator\data\media\motion\$JobId.mp4"
$out = "C:\Users\USER\Grok\apps\AIOSCreator\data\tmp-i2v-smoke"
New-Item -ItemType Directory -Force -Path $out | Out-Null
if (-not (Test-Path $mp4)) { throw "missing $mp4" }
ffprobe -v error -show_entries format=duration,size,bit_rate:stream=codec_name,width,height,avg_frame_rate,bit_rate,pix_fmt,nb_frames -of default=noprint_wrappers=1 $mp4
$dur = [double](ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 $mp4)
$t1 = [math]::Max(0.1, $dur * 0.08)
$t2 = $dur * 0.5
$t3 = [math]::Max(0.1, $dur * 0.9)
ffmpeg -y -ss $t1 -i $mp4 -frames:v 1 "$out\f1.jpg" 2>$null
ffmpeg -y -ss $t2 -i $mp4 -frames:v 1 "$out\f2.jpg" 2>$null
ffmpeg -y -ss $t3 -i $mp4 -frames:v 1 "$out\f3.jpg" 2>$null
Get-ChildItem $out | Select-Object Name, Length
"ok $JobId dur=$dur"
