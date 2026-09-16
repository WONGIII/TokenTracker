# ──────────────────────────────────────────────
# make-icon.ps1
# Generates the FORK's app mark: a PINK rounded square with a white "Z".
#
# This deliberately replaces upstream's black rounded square + white lightning
# bolt (AppIcon 02-bolt.svg). Two apps that look identical in the taskbar are
# impossible to tell apart, and the whole point of this fork is that it can sit
# next to an upstream install on the same machine.
#
# Writes:
#   TokenTrackerWin/assets/trayicon.ico   (exe icon, window/taskbar, installer)
#   dashboard/public/favicon.ico          (browser tab of the local dashboard)
#
#   powershell -ExecutionPolicy Bypass -File scripts\make-icon.ps1
# ──────────────────────────────────────────────
Add-Type -AssemblyName System.Drawing

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$WinProjDir = Split-Path -Parent $ScriptDir
$RepoRoot  = Split-Path -Parent $WinProjDir
$AssetsDir = Join-Path $WinProjDir 'assets'
New-Item -ItemType Directory -Force -Path $AssetsDir | Out-Null

# The pet is pink (see PetPage.jsx / ZzH), so the mark is too.
$PINK = [System.Drawing.Color]::FromArgb(255, 255, 111, 165)
$WHITE = [System.Drawing.Color]::White

function New-Pt([single]$x, [single]$y) { New-Object System.Drawing.PointF($x, $y) }

# A "Z" as ONE filled polygon (top bar -> diagonal -> bottom bar outline), in a
# 1024-unit box, matching the viewBox the upstream bolt path used. Drawing it as
# one outline avoids the pointed corners three overlapping shapes produce.
function Build-Z([single]$scale) {
    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $x0 = 252.0; $x1 = 772.0; $y0 = 252.0; $y1 = 772.0; $t = 136.0
    $s = $scale
    # Top bar and bottom bar: full-width rectangles.
    $gp.AddPolygon(@(
        (New-Pt ($x0 * $s) ($y0 * $s)),
        (New-Pt ($x1 * $s) ($y0 * $s)),
        (New-Pt ($x1 * $s) (($y0 + $t) * $s)),
        (New-Pt ($x0 * $s) (($y0 + $t) * $s))
    ))
    $gp.AddPolygon(@(
        (New-Pt ($x0 * $s) (($y1 - $t) * $s)),
        (New-Pt ($x1 * $s) (($y1 - $t) * $s)),
        (New-Pt ($x1 * $s) ($y1 * $s)),
        (New-Pt ($x0 * $s) ($y1 * $s))
    ))
    # Diagonal: a parallelogram between the underside of the top bar and the top
    # of the bottom bar, so every corner stays inside the gap (no pointed spurs).
    $gp.AddPolygon(@(
        (New-Pt (($x1 - $t) * $s) (($y0 + $t) * $s)),
        (New-Pt ($x1 * $s) (($y0 + $t) * $s)),
        (New-Pt (($x0 + $t) * $s) (($y1 - $t) * $s)),
        (New-Pt ($x0 * $s) (($y1 - $t) * $s))
    ))
    return $gp
}

function New-IconBitmap([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $radius = [math]::Round($size * 0.22)
    $d = $radius * 2
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $d, $d, 180, 90)
    $path.AddArc($size - $d, 0, $d, $d, 270, 90)
    $path.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
    $path.AddArc(0, $size - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    $bg = New-Object System.Drawing.SolidBrush($PINK)
    $g.FillPath($bg, $path)

    $z = Build-Z ([single]($size / 1024.0))
    $fg = New-Object System.Drawing.SolidBrush($WHITE)
    $g.FillPath($fg, $z)

    $bg.Dispose(); $fg.Dispose(); $z.Dispose(); $path.Dispose(); $g.Dispose()
    return $bmp
}

function Save-Ico([int[]]$sizes, [string]$outPath) {
    $pngs = @()
    foreach ($s in $sizes) {
        $bmp = New-IconBitmap $s
        $ms = New-Object System.IO.MemoryStream
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $pngs += , ($ms.ToArray()); $ms.Dispose(); $bmp.Dispose()
    }
    $out = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter($out)
    $bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$sizes.Count)
    $offset = 6 + (16 * $sizes.Count)
    for ($i = 0; $i -lt $sizes.Count; $i++) {
        $s = $sizes[$i]
        $bw.Write([byte]($(if ($s -ge 256) { 0 } else { $s })))
        $bw.Write([byte]($(if ($s -ge 256) { 0 } else { $s })))
        $bw.Write([byte]0); $bw.Write([byte]0)
        $bw.Write([uint16]1); $bw.Write([uint16]32)
        $bw.Write([uint32]$pngs[$i].Length); $bw.Write([uint32]$offset)
        $offset += $pngs[$i].Length
    }
    foreach ($png in $pngs) { $bw.Write($png) }
    $bw.Flush()
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outPath) | Out-Null
    [System.IO.File]::WriteAllBytes($outPath, $out.ToArray())
    $bw.Dispose(); $out.Dispose()
    Write-Host "Wrote $outPath ($([math]::Round((Get-Item $outPath).Length / 1KB, 1)) KB)"
}

Save-Ico @(256, 64, 48, 32, 16) (Join-Path $AssetsDir 'trayicon.ico')
Save-Ico @(64, 48, 32, 16) (Join-Path $RepoRoot 'dashboard\public\favicon.ico')
