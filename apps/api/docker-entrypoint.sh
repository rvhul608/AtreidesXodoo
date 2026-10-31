#!/bin/sh
set -eu

node db/migrate.js
node db/seed.js

exec node apps/api/dist/index.js
