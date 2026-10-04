# Retrieve the UUID from ``metadata.json``
UUID = $(shell grep -E '^[ ]*"uuid":' ./metadata.json | sed 's@^[ ]*"uuid":[ ]*"\(.\+\)",[ ]*@\1@')
VERSION = $(shell grep version tsconfig.json | awk -F\" '{print $$4}')

ifeq ($(XDG_DATA_HOME),)
XDG_DATA_HOME = $(HOME)/.local/share
endif

ifeq ($(strip $(DESTDIR)),)
INSTALLBASE = $(XDG_DATA_HOME)/gnome-shell/extensions
else
INSTALLBASE = $(DESTDIR)/usr/share/gnome-shell/extensions
endif
USER_SCHEMAS = $(XDG_DATA_HOME)/glib-2.0/schemas
INSTALLNAME = $(UUID)

PROJECTS = color_dialog floating_exceptions

$(info UUID is "$(UUID)")

.PHONY: all clean install zip-file local-install user-schemas restart-shell nested

sources = src/*.ts *.css

all: depcheck compile

clean:
	rm -rf _build target tsconfig.tsbuildinfo

# Configure local settings on system
configure:
	sh scripts/configure.sh

compile: $(sources) clean
	env PROJECTS="$(PROJECTS)" ./scripts/transpile.sh

# Rebuild, install, and listen to journalctl logs
debug: depcheck compile install user-schemas enable restart-shell listen

depcheck:
	@echo depcheck
	@if ! command -v tsc >/dev/null; then \
		echo \
		echo 'You must install TypeScript >= 3.8 to transpile: (node-typescript on Debian systems)'; \
		exit 1; \
	fi

enable:
	gnome-extensions enable "pop-shell@system76.com"

disable:
	gnome-extensions disable "pop-shell@system76.com"

listen:
	journalctl -o cat -n 0 -f "$$(which gnome-shell)" | grep -v warning

# Rebuild and install for this user. Does not run `configure`, which
# rewrites GNOME keybindings and mutter settings.
local-install: depcheck compile install user-schemas restart-shell

install:
	rm -rf $(INSTALLBASE)/$(INSTALLNAME)
	mkdir -p $(INSTALLBASE)/$(INSTALLNAME)
	cp -r _build/* $(INSTALLBASE)/$(INSTALLNAME)/

# Recompile the user schema directory, where the schema may be symlinked
# so that the gsettings command line sees new keys.
user-schemas:
	@if [ -d "$(USER_SCHEMAS)" ]; then glib-compile-schemas "$(USER_SCHEMAS)"; fi

uninstall:
	rm -rf $(INSTALLBASE)/$(INSTALLNAME)

# GNOME Shell on Wayland cannot restart in place
restart-shell:
	@echo "Log out and back in to load the new pop-shell build (or try it with 'make nested')"

# Run a nested GNOME Shell with the installed build, without logging out
nested:
	dbus-run-session -- gnome-shell --devkit --wayland

zip-file: all
	cd _build && zip -qr "../$(UUID)_$(VERSION).zip" .

.NOTPARALLEL: debug local-install
