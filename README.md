![alt text](image-1.png)
# 🦆 Ducktape: The lightest webui layer you'll find
A tiny helper to create a desktop application out of a web app, This is just an experiment and works the same way [gluon](https://github.com/gluon-framework/gluon) does, though it's abandonded now 😢

> [!WARNING]
> It's very incomplete so if you want something a bit more feature complete, Consider tauri, gluon or electron for this purpose

## MOTIVATION
Essentially, I have been wondering what has happened to native app development that we see so many Electron apps and I understand the want of simply using your website with a few native features but the real question is why does Electron package an entire build of chromium is it not possible to use a system web view (like Tauri) or simply the user's installed browser as almost every system will have Firefox or some build of Chromium (at least for Linux and Windows), This project is an experiment to see how usable it is to make a web app platform without electron

My findings that are due to chromium blocking several wanted features from being accessed by websites w/o a PWA being installed and the other various security that are unnecessarily being applied to a local website kind of make this difficult which justifies the electron build & in my opinion the feature disparity between firefox and chromium make it quite difficult to use it freely w/o limiting yourself to firefox's features, Mozilla takes a harder stance on web features so many useful ones simply don't end up included (eg: File System Access)

## ARCH
![alt text](image.png)

## TODO
It's still incomplete so complete it and do something with it, What I don't know lol, Also look into making it compatible with [welsonJS](https://github.com/gnh1201/welsonjs), To remove dependency on NodeJS so it can make use of more pre-installed windows components, Maybe let it automatically use a webview if it's installed (If it offers an actually wantable features)

- [ ] Compatability with NodeJS / Bun
- [ ] Package as npm package
- [ ] Add a better way for messaging to be setup