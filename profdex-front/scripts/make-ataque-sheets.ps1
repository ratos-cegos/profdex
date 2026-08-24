Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public static class AtaqueSheet {
  public const int Frames = 6;

  public static void Build(string srcPath, string dstPath, bool towardRight) {
    using (var src = Load(srcPath)) {
      int maxH = 256;
      float scale = src.Height > maxH ? (maxH / (float)src.Height) : 1f;
      int fw = Math.Max(1, (int)Math.Round(src.Width * scale));
      int fh = Math.Max(1, (int)Math.Round(src.Height * scale));
      int pad = Math.Max(4, fw / 5);
      int cellW = fw + pad * 2;
      int cellH = fh + Math.Max(4, fh / 16);

      using (var sheet = new Bitmap(cellW * Frames, cellH, PixelFormat.Format32bppArgb))
      using (var g = Graphics.FromImage(sheet)) {
        g.Clear(Color.Transparent);
        g.InterpolationMode = InterpolationMode.NearestNeighbor;
        g.PixelOffsetMode = PixelOffsetMode.Half;
        g.CompositingMode = CompositingMode.SourceOver;

        float[] t = { 0f, 0.18f, 0.55f, 1f, 0.4f, 0f };
        float[] back = { 0f, 0.35f, 0f, 0f, 0f, 0f };
        float[] lift = { 0f, 0f, 0.35f, 1f, 0.2f, 0f };

        int dir = towardRight ? 1 : -1;
        int lunge = pad;
        int hop = Math.Max(2, fh / 22);

        for (int i = 0; i < Frames; i++) {
          int dx = dir * (int)Math.Round(lunge * t[i] - lunge * 0.35 * back[i]);
          int dy = -(int)Math.Round(hop * lift[i]);
          int x = i * cellW + pad + dx;
          int y = cellH - fh - 2 + dy;
          g.DrawImage(src, new Rectangle(x, y, fw, fh));
        }

        sheet.Save(dstPath, ImageFormat.Png);
        Console.WriteLine(Path.GetFileName(dstPath) + " " + sheet.Width + "x" + sheet.Height + " cell " + cellW + "x" + cellH);
      }
    }
  }

  static Bitmap Load(string path) {
    var bytes = File.ReadAllBytes(path);
    using (var ms = new MemoryStream(bytes))
    using (var tmp = new Bitmap(ms)) {
      var bmp = new Bitmap(tmp.Width, tmp.Height, PixelFormat.Format32bppArgb);
      using (var g = Graphics.FromImage(bmp)) g.DrawImageUnscaled(tmp, 0, 0);
      return bmp;
    }
  }
}
"@ -ReferencedAssemblies System.Drawing.dll

$dir = Join-Path $PSScriptRoot '..\public\professors'
$pairs = @(
  @{ slug = 'eron'; frente = 'eron-frente.png'; costas = 'eron-costas.png' }
  @{ slug = 'gustavo'; frente = 'gustavo-frente.png'; costas = 'gustavo-costas.png' }
  @{ slug = 'joao'; frente = 'joao-frente.png'; costas = 'joao-costas.png' }
  @{ slug = 'mario'; frente = 'mario-frente.png'; costas = 'mario-costas.png' }
  @{ slug = 'simone'; frente = 'simone-frente.png'; costas = 'simone-costas.png' }
  @{ slug = 'tania'; frente = 'tania-frente.png'; costas = 'tania-costas.png' }
)

foreach ($p in $pairs) {
  $frente = Join-Path $dir $p.frente
  $costas = Join-Path $dir $p.costas
  if (-not (Test-Path $frente)) { Write-Host "skip frente $($p.slug)"; continue }
  [AtaqueSheet]::Build($frente, (Join-Path $dir "$($p.slug)-ataque-sheet.png"), $true)
  if (Test-Path $costas) {
    [AtaqueSheet]::Build($costas, (Join-Path $dir "$($p.slug)-ataque-costas-sheet.png"), $false)
  }
}
