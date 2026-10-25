using CUE4Parse.UE4.Assets.Exports.Texture;
using CUE4Parse_Conversion.Textures;
using Newtonsoft.Json.Linq;
using SkiaSharp;

/// <summary>
/// Exports the item and station icons that data/site-data.json references, as small WebP files named after the texture
/// (T_UI_Icon..._D.webp). Icon paths are relative to the Gameplay icon folder, except DLC ones, which are
/// absolute /Game/... paths.
/// </summary>
static class IconExport
{
    const string IconRoot = "/Game/Dune/GUI/Textures/Icons/Gameplay/";

    public static int Run(string[] args)
    {
        if (args.Length < 5)
        {
            Console.Error.WriteLine("usage: RecipeExport icons <paks-dir> <mappings.usmap> <oodle-dll> <site-data.json> <out-dir> [size=64]");
            return 2;
        }
        var (paksDir, usmapPath, oodleDll, siteData, outDir) = (args[0], args[1], args[2], args[3], args[4]);
        var size = args.Length > 5 ? int.Parse(args[5]) : 64;

        var data = JObject.Parse(File.ReadAllText(siteData));
        var itemIcons = data["items"]!.Children<JProperty>().Select(p => (string?)p.Value["i"]);
        var stationIcons = (data["stationIcons"] as JObject)?.Properties().Select(p => (string?)p.Value) ?? [];
        var icons = itemIcons.Concat(stationIcons).OfType<string>().Distinct().Order().ToList();
        Console.WriteLine($"{icons.Count} icons referenced by {siteData}");

        var provider = GameFiles.Open(paksDir, usmapPath, oodleDll);
        Directory.CreateDirectory(outDir);

        // The icons are BC7. The default BC7 path goes through the native Detex library, which would need a
        // separate download; AssetRipper's managed decoder needs nothing.
        TextureDecoder.UseAssetRipperTextureDecoder = true;

        var failures = 0;
        long bytes = 0;
        foreach (var icon in icons)
        {
            var package = icon.StartsWith("/Game/") ? icon : IconRoot + icon;
            var name = package[(package.LastIndexOf('/') + 1)..];
            try
            {
                var texture = provider.LoadPackageObject<UTexture2D>($"{package}.{name}");
                using var source = texture.Decode()?.ToSkBitmap() ?? throw new InvalidDataException("texture did not decode");
                var webp = EncodeIcon(source, size);
                File.WriteAllBytes(Path.Combine(outDir, name + ".webp"), webp);
                bytes += webp.Length;
            }
            catch (Exception e)
            {
                failures++;
                Console.WriteLine($"  FAIL {package}: {e.GetType().Name}: {e.Message}");
            }
        }
        Console.WriteLine($"{icons.Count - failures} icons written to {outDir} ({bytes / 1024} KB), {failures} failed");
        return failures == 0 ? 0 : 1;
    }

    /// <summary>
    /// Crops the transparent padding the game's icons carry, then centres the content in a size x size square
    /// (filling 92% of it) and encodes it as WebP. Without the crop, an ingot shown at 28px is a speck.
    /// </summary>
    static byte[] EncodeIcon(SKBitmap source, int size)
    {
        var content = ContentBounds(source);
        var scale = size * 0.92f / Math.Max(content.Width, content.Height);
        var (w, h) = (content.Width * scale, content.Height * scale);
        var dest = SKRect.Create((size - w) / 2, (size - h) / 2, w, h);

        using var icon = new SKBitmap(new SKImageInfo(size, size, SKColorType.Rgba8888, SKAlphaType.Premul));
        using (var canvas = new SKCanvas(icon))
        using (var paint = new SKPaint { FilterQuality = SKFilterQuality.High, IsAntialias = true })
        {
            canvas.Clear(SKColors.Transparent);
            canvas.DrawBitmap(source, content, dest, paint);
        }
        using var image = SKImage.FromBitmap(icon);
        using var data = image.Encode(SKEncodedImageFormat.Webp, 85);
        return data.ToArray();
    }

    /// <summary>Bounding box of the pixels that are not (nearly) transparent; the whole bitmap if none are.</summary>
    static SKRect ContentBounds(SKBitmap bitmap)
    {
        var full = SKRect.Create(bitmap.Width, bitmap.Height);
        if (bitmap.BytesPerPixel != 4) return full;
        var pixels = bitmap.GetPixelSpan();
        int minX = bitmap.Width, minY = bitmap.Height, maxX = -1, maxY = -1;
        for (var y = 0; y < bitmap.Height; y++)
        {
            var row = y * bitmap.RowBytes;
            for (var x = 0; x < bitmap.Width; x++)
            {
                if (pixels[row + x * 4 + 3] <= 16) continue; // alpha is the 4th byte in RGBA and BGRA alike
                minX = Math.Min(minX, x);
                maxX = Math.Max(maxX, x);
                minY = Math.Min(minY, y);
                maxY = Math.Max(maxY, y);
            }
        }
        return maxX < 0 ? full : new SKRect(minX, minY, maxX + 1, maxY + 1);
    }
}
