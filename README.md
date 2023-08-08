
# Tana Utilities

This repository contains miscellaneous Tana-related stuff.  It's a bit of a mess and not really suited for third party use, but I'm putting it up on github in case some of the pieces are useful to someone.

### Utilities and libraries 

I run these with `ts-node`:

- `util/backup.ts` is my daily bacup script. It extracts the tana json data from chrome's indexed db, saves it locally, and downloads any attachments.
- `util/tana_query_repl.ts` runs a datalog query against tana.
- `util/decode.ts` is a decoder for v8's internal serialization format, used for pulling data out of indexedDB.
- `util/database.ts` is a DataStore class that loads tana json and executes datalog queries, used to find attachments to download.

# App

There is a wee web-app that renders `www/out.json`. I'm running it with `node scripts/server.js`.


Also, `tanamath.js` does not work - I need reliable ways to stuff the source back in when the row switches to edit mode.
