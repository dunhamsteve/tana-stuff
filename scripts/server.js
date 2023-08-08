const {build, context} = require('esbuild');

// watch / build / serve
async function doit() {
    let ctx = await context({
        entryPoints: ["src/main.ts"],
        bundle: true,
        outdir: "www",
        minify: false,
        loader: {
            '.svg': 'dataurl'
        },
        logLevel: 'info',
    });
    await ctx.watch();
    let { host, port} = await ctx.serve({servedir: 'www'});
    console.log({host,port});
    
}
doit().catch(console.error);

