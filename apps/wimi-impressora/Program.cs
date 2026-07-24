using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace WimiImpressora;

internal static class Program
{
    [STAThread]
    private static async Task<int> Main(string[] args)
    {
        if (args.Length >= 2 && args[0].Equals("--apply-update", StringComparison.OrdinalIgnoreCase))
        {
            return Installer.ApplyUpdate(args[1]);
        }

        if (args.Length >= 2 && args[0].Equals("--render-preview", StringComparison.OrdinalIgnoreCase))
        {
            var payload = args.Length >= 3 && args[2].Equals("purchase", StringComparison.OrdinalIgnoreCase)
                ? PrinterService.PurchasePreviewPayload()
                : PrinterService.QuickVoucherPreviewPayload();
            PrinterService.RenderPreview(payload, args[1]);
            return 0;
        }

        if (args.Contains("--service", StringComparer.OrdinalIgnoreCase))
        {
            return await RunServiceAsync(args);
        }

        return await Installer.RunAsync();
    }

    private static async Task<int> RunServiceAsync(string[] args)
    {
        var store = new ConfigStore();
        var config = store.LoadRequired();
        var builder = Host.CreateApplicationBuilder(args);
        builder.Services.AddWindowsService(options => options.ServiceName = AppConstants.ServiceDisplayName);
        builder.Services.AddSingleton(store);
        builder.Services.AddSingleton(config);
        builder.Services.AddSingleton<ApiClient>();
        builder.Services.AddSingleton<PrinterService>();
        builder.Services.AddHostedService<AgentWorker>();
        using var host = builder.Build();
        await host.RunAsync();
        return 0;
    }
}
