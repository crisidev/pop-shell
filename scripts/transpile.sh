#!/bin/sh
set -ex

rm -rf _build
mkdir -p _build

glib-compile-schemas schemas &

# Compile TypeScript into target/
tsc

wait

# Assemble the extension in _build/
cp -r metadata.json schemas _build
cp target/*.js _build
