using CUE4Parse.Compression;
using CUE4Parse.FileProvider;
using CUE4Parse.MappingsProvider.Usmap;
using CUE4Parse.UE4.Versions;

/// <summary>Mounts the game's paks with the generated mappings; shared by every export mode.</summary>
static class GameFiles
{
    public static DefaultFileProvider Open(
        string paksDir,
        string usmapPath,
        string oodleDll,
        Dictionary<string, KeyValuePair<string, string>>? mapStructTypes = null)
    {
        OodleHelper.Initialize(oodleDll);
        var versions = new VersionContainer(EGame.GAME_DuneAwakening, mapStructTypesOverrides: mapStructTypes);
        var provider = new DefaultFileProvider(paksDir, SearchOption.TopDirectoryOnly, versions);
        provider.MappingsContainer = new FileUsmapTypeMappingsProvider(usmapPath);
        provider.Initialize();
        provider.Mount();
        provider.PostMount(); // builds the virtual path and localization indexes
        Console.WriteLine($"mounted {provider.MountedVfs.Count} containers, {provider.Files.Count} files");
        return provider;
    }
}
