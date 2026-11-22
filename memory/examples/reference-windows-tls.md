---
name: Windows TLS behind antivirus
description: TLS inspection by a local antivirus breaks Python and git; fixes that work
type: reference
---

On a Windows machine with an antivirus that inspects HTTPS, Python requests and git fail with certificate errors.

- Python: `pip install truststore`, then `import truststore; truststore.inject_into_ssl()` before any request. It uses the Windows certificate store, which trusts the antivirus root.
- git: `git -c http.sslBackend=schannel push` (or set it once with `git config --global http.sslBackend schannel`).
- Node: `NODE_OPTIONS=--use-system-ca` on Node 22+.
- Website checks run from this machine show the antivirus as the certificate issuer; a server shows the real issuer.
