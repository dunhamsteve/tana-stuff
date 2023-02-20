const {build, context} = require('esbuild');

// watch / build / serve
async function doit() {
    let ctx = await context({
        entryPoints: ["src/main.tsx"],
        bundle: true,
        minify: false,
        outdir: "dist",
        loader: { '.svg': 'dataurl' },
        logLevel: 'info',
        jsx: 'transform',
        jsxFactory: 'h',
    });
    await ctx.watch();
    let { host, port} = await ctx.serve();
    console.log({host,port});
}
doit().catch(console.error);

