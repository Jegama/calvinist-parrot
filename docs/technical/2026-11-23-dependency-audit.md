# Dependency audit, November 23, 2026

The baseline is commit `ed327da`. The npm registry reported 60 affected entries in the production tree and 101 in the full lock. In both trees it classified Express, Next.js and proxy-addr as critical. npm includes packages that inherit advisories from a dependency. The inventory below lists the 33 packages to which npm directly attributed 120 distinct advisory IDs. [Issue #102](https://github.com/Jegama/calvinist-parrot/issues/102)

| Scope | Baseline | After remediation |
| --- | --- | --- |
| npm production | 3 critical, 46 high, 10 moderate, 1 low | 0 |
| npm full | 3 critical, 73 high, 24 moderate, 1 low | 0 |
| Python production lock | 11 records across 4 of 33 pins | 0 across 33 pins |
| Python development lock | 11 records across 4 of 46 pins | 0 across 48 pins |

## Application and MCP dependencies

The production Study Bible tool uses `@langchain/mcp-adapters` 1.1.3 and shares MCP SDK 1.32.2 with `@google/genai` 1.34.0. The updated chain resolves `@hono/node-server` 2.1.11. The shadcn 4.23.0 development CLI uses MCP server/core 2.4.0. The auth and worker control-plane SDKs resolve to `appwrite` 16.0.2 and `node-appwrite` 27.1.0. The latter now uses Undici 6.29.1.

Next.js moves to 16.4.6. The existing ESLint preset 16.2.12 and React Hooks plugin 7.0.1 retain the project’s lint policy. Both were included in the clean full-tree audit.

Prisma Client, its PostgreSQL adapter and the CLI move together to 7.10.1. Two overrides target specific parent versions. Prisma config 7.10.1 pins an affected release of Effect, so it uses 3.22.5. The shadcn CLI's `@ts-morph/common` 0.27.0 uses the named `minimatch` function and still requests an affected major, so it uses 11.0.9. The CLI starts and its file discovery matches TypeScript files using brace and wildcard patterns. Re-evaluate each override when its parent updates.

## Python worker

The Appwrite Function specifies Python 3.14 and installs the production lock followed by the worker wheel. The Appwrite SDK remains at 22.2.0 and google-genai at 3.3.0. The development lock now includes the pip and setuptools versions required by pip-tools 7.7.0 with its stable extra. Both documented compilations reproduced the locks byte-for-byte under Python 3.14.10. PyPI also reported zero advisories for the isolated build backend `hatchling==1.28.0`.

| Resolved package | Before | After | Remediated advisories, with aliases counted once |
| --- | --- | --- | --- |
| certifi | 2026.7.22 | 2026.11.20 | PYSEC-2026-4320 |
| cryptography | 49.0.0 | 50.0.2 | CVE-2026-69247 |
| pyasn1 | 0.6.4 | 0.6.5 | CVE-2026-119194, CVE-2026-119195, CVE-2026-119196, CVE-2026-119197 |
| urllib3 | 2.7.0 | 2.8.0 | CVE-2026-97687, CVE-2026-97688, CVE-2026-97689 |

The npm checks used `npm audit --package-lock-only` and the same command with `--omit=dev`. The worker checks used pip-audit 2.10.1 with `--strict --disable-pip --no-deps -r` on each compiled lock. Each pin returned an advisory result.

## CI and database image

The checkout, Node setup and Python setup actions were reviewed against their upstream releases and published advisories. The workflows pin checkout 7.0.1, setup-node 7.1.0 and setup-python 7.1.0 and the new pip-audit action 1.1.0 by commit. Dependabot is configured weekly for npm, pip, GitHub Actions and Docker Compose. The Monday audit checks both npm scopes and both Python locks, and flags high or critical Debian image findings when a fix is available. The workflow identifies the affected package and advisory in the failing job. The GitHub API denied access to the repository's Dependabot alerts setting. The repository maintainer owns verification of that switch by November 30, 2026.

CI and local Compose use PostgreSQL 17.12 with pgvector 0.8.7 on Debian 12.15. The immutable multi-architecture image digest is `sha256:b513c48566e4777cd3370451400000c78eda6a08131d68f4c31d4a76f27bd8fd`. This retains compatibility with the existing PostgreSQL 17 development volume. pgvector 0.8.7 includes the upstream IVFFlat index build fix. [PostgreSQL release notes](https://www.postgresql.org/docs/release/17.12/) · [pgvector changelog](https://github.com/pgvector/pgvector/blob/v0.8.7/CHANGELOG.md)

**Outstanding image findings.** Trivy 0.76.2 scanned the Linux amd64 image with its November 23 vulnerability database. It reported 556 OS package matches across 196 distinct advisories, including Debian temporary IDs. Three are critical, 37 high, 65 medium, 76 low and 15 have unknown severity. Debian supplied no fixed package version for these matches. They affect libraries shipped in the development and CI database container. This scan does not establish reachability through PostgreSQL or the state of the managed production database. The repository maintainer owns the November 30, 2026 review of the Bookworm packages and upstream image for all findings in the image inventory. The three critical matches are in libsqlite3-0, libxml2 and zlib1g.

### Maintainer disposition for the pinned development and CI image

Compose publishes PostgreSQL on IPv4 loopback at `127.0.0.1:54322`. The team accepts the remaining exposure for development and CI through November 30, 2026. Review earlier if Debian ships a fix or an application change introduces a reachable input path. Retain the scanner findings and prioritize the high-severity matches in libraries loaded by PostgreSQL. The production service requires a separate assessment.

| Critical scanner match | Disposition and evidence |
| --- | --- |
| zlib1g, CVE-2023-45853 | Inapplicable to this binary. Debian omits the affected MiniZip code from Bookworm's zlib build, and the image has no separate MiniZip package installed. [Debian tracker](https://security-tracker.debian.org/tracker/CVE-2023-45853) |
| libsqlite3-0, CVE-2025-7458 | Temporarily accepted. The affected SQLite library is installed. The issue requires SQL execution through SQLite. The app uses PostgreSQL, and the repository review found no SQLite execution path. [Debian tracker](https://security-tracker.debian.org/tracker/CVE-2025-7458) |
| libxml2, CVE-2026-6653 | Open, first priority for re-review. PostgreSQL links libxml2. The repository review found no database query that parses user-supplied XML, although a direct SQL client can invoke PostgreSQL's XML functions. Debian has deferred the Bookworm fix. [Debian tracker](https://security-tracker.debian.org/tracker/CVE-2026-6653) |

## Remediated npm inventory

Package | Before | After | Tree | Remediated advisories
--- | --- | --- | --- | ---
@hono/node-server | 1.19.15 | 2.1.11 | Production | GHSA-rmxm-3fg6-px4f, GHSA-jpvv-r467-5p4w
@humanfs/node | 0.16.7 | 0.16.8 | Development | GHSA-p498-v437-472g
@modelcontextprotocol/sdk | 1.29.0 | 1.32.2 | Production | GHSA-6qxp-vccf-f47h, GHSA-22jm-h49p-29qw, GHSA-46jr-4wx8-v453, GHSA-rvq5-wwqv-78pq, GHSA-f897-62hf-6gxq, GHSA-6prh-2h8m-c8cw
@vitest/mocker | 4.1.10 | 4.1.12 | Development | GHSA-82fw-gwwq-j7x9, GHSA-qxg6-89mg-rqv8
axios | 1.18.1 | 1.21.1 | Production | GHSA-vh66-26gq-q6x8, GHSA-9fr6-4gfg-395g, GHSA-c29m-xwm3-cm6r, GHSA-mghh-pgcx-3jjj, GHSA-x97p-jq2g-jp4f, GHSA-3pq3-5fj3-cg6v, GHSA-542g-h47m-68v8, GHSA-j8rh-479h-cp32, GHSA-4hqw-qxg8-jxx2, GHSA-m8m8-qj5v-23w3, GHSA-44g4-m2mj-wpvx, GHSA-r4gj-5m52-g5wh
baseline-browser-mapping | 2.10.13 | 2.11.39 | Production | GHSA-w5vr-8v7q-w6rv
body-parser | 2.3.0 | 2.4.0 | Production | GHSA-27r3-jxmh-p828
brace-expansion | 1.1.16, 5.0.8 | 1.1.22, 5.1.0 | Development | GHSA-mh99-v99m-4gvg, GHSA-rgw5-rvv9-x895, GHSA-q2hr-2g5m-vwhr, GHSA-qhr7-859c-m2p7, GHSA-6j4f-fj2g-mc7p
browserslist | 4.28.0 | 4.29.6 | Development | GHSA-c83g-rgw3-j3cx, GHSA-73wf-gq98-2v4g
csv-parse | 7.0.1 | 7.0.3 | Production | GHSA-8cw4-87c7-c6xx
deepmerge-ts | 7.1.5 | 8.0.2 | Production | GHSA-ggr8-5vv4-36mx
effect | 3.20.0 | 3.22.5 | Production | GHSA-7589-6fvf-x4pw
fast-uri | 3.1.4 | 3.1.9 | Production | GHSA-7p8r-x3mc-p8w7, GHSA-5jgf-p345-68v8, GHSA-f65p-4m7j-42xc, GHSA-fph4-wmhf-6fwf, GHSA-jqff-g426-hqxp, GHSA-qw65-cvwx-89v3, GHSA-hrr3-gc8f-f4qj, GHSA-w74x-v6f9-j3xg, GHSA-xhq7-xmqj-769h, GHSA-wjr9-j795-jxcr, GHSA-333x-w4r6-6crp
find-my-way | 9.6.0 | 9.7.0 | Production | GHSA-c96f-x56v-gq3h
follow-redirects | 1.16.0 | 1.16.3 | Production | GHSA-q3jh-wrc6-jgq8, GHSA-8r9p-f939-6h3c, GHSA-mrwp-f3q8-3g9p
hono | 4.12.32 | 4.13.21 | Production | GHSA-8j4g-w8fx-2239, GHSA-f23p-vx2j-j53r, GHSA-79qm-7rj5-m7r9, GHSA-54fx-42gc-7vw4, GHSA-gqvv-2mrq-wpjv, GHSA-g6gw-c38x-mqfc, GHSA-crvj-82cr-hjcx, GHSA-hxh3-vqpv-xpqv, GHSA-5r4p-p66f-jhc7, GHSA-4m76-xfj5-7975, GHSA-h7mg-cq63-vhpq, GHSA-3gg2-335m-rxc6, GHSA-46wx-v44x-9hh2, GHSA-4h7h-rv7c-7m2v
ip-address | 10.3.1 | 10.7.6 | Production | GHSA-rpw4-54j3-4h4q, GHSA-2vr4-cq9g-pvrc, GHSA-j6r3-76f7-8jcv, GHSA-h3mg-xc3c-68pw, GHSA-rxp7-6hxx-x8q5
js-yaml | 4.3.0 | 4.3.2 | Development | GHSA-5p4m-2wfm-xmqj, GHSA-2883-xcg3-v3hh
minimatch | 10.2.5, 3.1.5 | 11.0.9, 3.1.5 | Development | GHSA-g3hv-75wg-m249
mysql2 | 3.15.3 | 3.24.4 | Production | GHSA-3f6p-5ww8-9rcr, GHSA-rgwj-5xj2-c3m3
nanoid | 3.3.16 | 3.3.20 | Production | GHSA-2v37-7h3g-55p8
next | 16.2.12 | 16.4.6 | Production | GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4, GHSA-vcvr-r3jv-pc5j, GHSA-4jqv-mc3x-m676, GHSA-39w2-rjm5-chcv, GHSA-f87g-xv8r-7p7x, GHSA-mcj8-r9mp-w47p, GHSA-cjq9-62q9-8jv4, GHSA-2464-fhr4-w9xw, GHSA-p3m5-59mp-jv5r, GHSA-673q-mjm6-r5xr, GHSA-vc7v-qv4w-wrv8, GHSA-7qx7-33qx-rqx2, GHSA-f3mh-rxg3-f5g2, GHSA-pc58-hwjq-p385, GHSA-rhh4-g77r-r9qj
postcss | 8.4.31, 8.5.23 | 8.5.23, 8.5.33 | Production | GHSA-qx2v-qp2m-jg93, GHSA-6g55-p6wh-862q, GHSA-fxqj-rqcc-2cmp, GHSA-r28c-9q8g-f849
postcss-selector-parser | 6.1.2, 7.1.1 | 6.1.6, 7.2.1 | Production | GHSA-w9m9-85wc-3x92, GHSA-rj75-hqrm-r3gf
proxy-addr | 2.0.7 | 2.0.8 | Production | GHSA-jqcg-44mw-7w3h
qs | 6.15.3 | 6.17.1 | Production | GHSA-x5fp-wj9c-mxmx, GHSA-4mjr-xmp4-gh2g, GHSA-6pq8-jhm2-2vcw
sharp | 0.34.5 | 0.35.5 | Production | GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c, GHSA-wq5f-xc86-pv6w
source-map-js | 1.2.1 | 1.2.4 | Production | GHSA-68fv-2mgg-jv7q
undici | 6.28.0 | 6.29.1, 7.30.2 | Production | GHSA-3wwx-pv8p-q78v, GHSA-r53p-7pc4-xj5r, GHSA-rfgv-xxqx-mfg5, GHSA-4qv8-2p9j-2685, GHSA-xjj6-f33q-929c, GHSA-2m5v-pch6-74hx, GHSA-qrxm-fqhp-jwvm, GHSA-9fm3-97px-rjf6
valibot | 1.2.0 | 1.4.2 | Production | GHSA-5qjj-4xww-7phc
vite | 8.1.5 | 8.3.8 | Development | GHSA-698v-4r3x-3vcv, GHSA-r825-w8mm-5pxw, GHSA-587h-7wmj-h5pm, GHSA-9jrq-w75r-8gcw, GHSA-rq7h-c2jc-7f22
vitest | 4.1.10 | 4.1.12 | Development | GHSA-82fw-gwwq-j7x9
zod | 3.25.76, 4.4.3 | 4.6.7 | Production | GHSA-mrhx-c7xc-m3w5

## Outstanding image inventory

Each row groups advisory IDs with the same package versions, severity and Debian disposition. The impact, owner and review date above apply to every row.

| Severity | Debian status | Installed package versions | Advisory IDs |
| --- | --- | --- | --- |
| Critical | affected | libsqlite3-0 3.40.1-2+deb12u2 | CVE-2025-7458 |
| Critical | fix deferred | libxml2 2.9.14+dfsg-1.3~deb12u6 | CVE-2026-6653 |
| Critical | will not fix | zlib1g 1:1.2.13.dfsg-1 | CVE-2023-45853 |
| High | affected | bsdutils 1:2.38.1-5+deb12u3, libblkid1 2.38.1-5+deb12u3, libfdisk1 2.38.1-5+deb12u3, libmount1 2.38.1-5+deb12u3, libsmartcols1 2.38.1-5+deb12u3, libuuid1 2.38.1-5+deb12u3, mount 2.38.1-5+deb12u3, util-linux 2.38.1-5+deb12u3, util-linux-extra 2.38.1-5+deb12u3 | CVE-2026-53613, CVE-2026-53615, CVE-2026-78410 |
| High | fix deferred | gzip 1.12-1 | CVE-2026-41992 |
| High | fix deferred | libacl1 2.3.1-3 | CVE-2026-54369 |
| High | affected | libgssapi-krb5-2 1.20.1-2+deb12u5, libk5crypto3 1.20.1-2+deb12u5, libkrb5-3 1.20.1-2+deb12u5, libkrb5support0 1.20.1-2+deb12u5 | CVE-2026-107364, CVE-2026-112315, CVE-2026-112316, CVE-2026-112317, CVE-2026-112318, CVE-2026-112319, CVE-2026-112320, CVE-2026-112321, CVE-2026-112322, CVE-2026-112323, CVE-2026-118380, CVE-2026-119079, CVE-2026-71199, CVE-2026-71200 |
| High | affected | libldap-2.5-0 2.5.13+dfsg-5 | CVE-2023-2953 |
| High | affected | libncursesw6 6.4-4, libtinfo6 6.4-4, ncurses-base 6.4-4, ncurses-bin 6.4-4 | CVE-2025-69720 |
| High | affected | libpam-modules 1.5.2-6+deb12u2, libpam-modules-bin 1.5.2-6+deb12u2, libpam-runtime 1.5.2-6+deb12u2, libpam0g 1.5.2-6+deb12u2 | CVE-2025-6020 |
| High | fix deferred | libperl5.36 5.36.0-7+deb12u4, perl 5.36.0-7+deb12u4, perl-base 5.36.0-7+deb12u4, perl-modules-5.36 5.36.0-7+deb12u4 | CVE-2026-9538 |
| High | affected | libsqlite3-0 3.40.1-2+deb12u2 | CVE-2026-119373, CVE-2026-119374, CVE-2026-119379 |
| High | fix deferred | libsqlite3-0 3.40.1-2+deb12u2 | CVE-2026-11822, CVE-2026-11824 |
| High | affected | libssl3 3.0.22-1~deb12u2, openssl 3.0.22-1~deb12u2 | CVE-2026-107494 |
| High | fix deferred | libsystemd-shared 252.39-1~deb12u2, libsystemd0 252.39-1~deb12u2, libudev1 252.39-1~deb12u2, systemd 252.39-1~deb12u2 | CVE-2026-16742 |
| High | fix deferred | libxml2 2.9.14+dfsg-1.3~deb12u6 | CVE-2026-74860, CVE-2026-86138, CVE-2026-86140, CVE-2026-86142, CVE-2026-86143, CVE-2026-86144 |
| High | affected | zlib1g 1:1.2.13.dfsg-1 | CVE-2026-85091 |
| Medium | affected | bsdutils 1:2.38.1-5+deb12u3, libblkid1 2.38.1-5+deb12u3, libfdisk1 2.38.1-5+deb12u3, libmount1 2.38.1-5+deb12u3, libsmartcols1 2.38.1-5+deb12u3, libuuid1 2.38.1-5+deb12u3, mount 2.38.1-5+deb12u3, util-linux 2.38.1-5+deb12u3, util-linux-extra 2.38.1-5+deb12u3 | CVE-2026-13595, CVE-2026-27456 |
| Medium | will not fix | bsdutils 1:2.38.1-5+deb12u3, libblkid1 2.38.1-5+deb12u3, libfdisk1 2.38.1-5+deb12u3, libmount1 2.38.1-5+deb12u3, libsmartcols1 2.38.1-5+deb12u3, libuuid1 2.38.1-5+deb12u3, mount 2.38.1-5+deb12u3, util-linux 2.38.1-5+deb12u3, util-linux-extra 2.38.1-5+deb12u3 | CVE-2026-3184 |
| Medium | affected | dirmngr 2.2.40-1.1+deb12u2, gnupg 2.2.40-1.1+deb12u2, gnupg-l10n 2.2.40-1.1+deb12u2, gnupg-utils 2.2.40-1.1+deb12u2, gpg 2.2.40-1.1+deb12u2, gpg-agent 2.2.40-1.1+deb12u2, gpg-wks-client 2.2.40-1.1+deb12u2, gpg-wks-server 2.2.40-1.1+deb12u2, gpgconf 2.2.40-1.1+deb12u2, gpgsm 2.2.40-1.1+deb12u2, gpgv 2.2.40-1.1+deb12u2 | CVE-2025-30258, CVE-2025-68972 |
| Medium | affected | gcc-12-base 12.2.0-14+deb12u1, libgcc-s1 12.2.0-14+deb12u1, libstdc++6 12.2.0-14+deb12u1 | CVE-2026-114690, CVE-2026-114691, CVE-2026-125709 |
| Medium | fix deferred | gcc-12-base 12.2.0-14+deb12u1, libgcc-s1 12.2.0-14+deb12u1, libstdc++6 12.2.0-14+deb12u1 | CVE-2026-102010, CVE-2026-95619 |
| Medium | fix deferred | gzip 1.12-1 | CVE-2026-41991 |
| Medium | fix deferred | libacl1 2.3.1-3 | CVE-2026-54370 |
| Medium | fix deferred | libattr1 1:2.5.1-4 | CVE-2026-54371 |
| Medium | affected | libbz2-1.0 1.0.8-5+b1 | CVE-2026-42250 |
| Medium | affected | libc-bin 2.36-9+deb12u14, libc-l10n 2.36-9+deb12u14, libc6 2.36-9+deb12u14, locales 2.36-9+deb12u14 | CVE-2026-115819, CVE-2026-5435, CVE-2026-5450, CVE-2026-5928, CVE-2026-6238, CVE-2026-84243, CVE-2026-86805, CVE-2026-95818 |
| Medium | fix deferred | libc-bin 2.36-9+deb12u14, libc-l10n 2.36-9+deb12u14, libc6 2.36-9+deb12u14, locales 2.36-9+deb12u14 | CVE-2026-18374, CVE-2026-19499, CVE-2026-19542, CVE-2026-6368, CVE-2026-6791, CVE-2026-77117, CVE-2026-80489, CVE-2026-8674, CVE-2026-89092 |
| Medium | affected | libgssapi-krb5-2 1.20.1-2+deb12u5, libk5crypto3 1.20.1-2+deb12u5, libkrb5-3 1.20.1-2+deb12u5, libkrb5support0 1.20.1-2+deb12u5 | CVE-2026-107884, CVE-2026-111423, CVE-2026-112314 |
| Medium | fix deferred | libgssapi-krb5-2 1.20.1-2+deb12u5, libk5crypto3 1.20.1-2+deb12u5, libkrb5-3 1.20.1-2+deb12u5, libkrb5support0 1.20.1-2+deb12u5 | CVE-2026-107708, CVE-2026-107778 |
| Medium | affected | libncursesw6 6.4-4, libtinfo6 6.4-4, ncurses-base 6.4-4, ncurses-bin 6.4-4 | CVE-2023-50495 |
| Medium | fix deferred | libp11-kit0 0.24.1-2 | CVE-2026-13757, CVE-2026-18938 |
| Medium | affected | libpam-modules 1.5.2-6+deb12u2, libpam-modules-bin 1.5.2-6+deb12u2, libpam-runtime 1.5.2-6+deb12u2, libpam0g 1.5.2-6+deb12u2 | CVE-2024-22365 |
| Medium | fix deferred | libpam-modules 1.5.2-6+deb12u2, libpam-modules-bin 1.5.2-6+deb12u2, libpam-runtime 1.5.2-6+deb12u2, libpam0g 1.5.2-6+deb12u2 | CVE-2026-54411 |
| Medium | will not fix | libpam-modules 1.5.2-6+deb12u2, libpam-modules-bin 1.5.2-6+deb12u2, libpam-runtime 1.5.2-6+deb12u2, libpam0g 1.5.2-6+deb12u2 | CVE-2024-10041 |
| Medium | fix deferred | libperl5.36 5.36.0-7+deb12u4, perl 5.36.0-7+deb12u4, perl-base 5.36.0-7+deb12u4, perl-modules-5.36 5.36.0-7+deb12u4 | CVE-2026-15534, CVE-2026-82560 |
| Medium | affected | libsasl2-2 2.1.28+dfsg-10+deb12u1, libsasl2-modules-db 2.1.28+dfsg-10+deb12u1 | CVE-2026-132138 |
| Medium | affected | libsqlite3-0 3.40.1-2+deb12u2 | CVE-2025-7709, CVE-2026-119371, CVE-2026-119372, CVE-2026-119375, CVE-2026-119376, CVE-2026-119378, CVE-2026-119591 |
| Medium | fix deferred | libsqlite3-0 3.40.1-2+deb12u2 | CVE-2026-50812, CVE-2026-50813 |
| Medium | affected | libssl3 3.0.22-1~deb12u2, openssl 3.0.22-1~deb12u2 | CVE-2026-107496, CVE-2026-121482, CVE-2026-84786, CVE-2026-95690 |
| Medium | fix deferred | libsystemd-shared 252.39-1~deb12u2, libsystemd0 252.39-1~deb12u2, libudev1 252.39-1~deb12u2, systemd 252.39-1~deb12u2 | CVE-2026-15059 |
| Medium | fix deferred | libxml2 2.9.14+dfsg-1.3~deb12u6 | CVE-2026-76781 |
| Medium | fix deferred | libxslt1.1 1.1.35-1+deb12u4 | CVE-2025-10911 |
| Medium | affected | tar 1.34+dfsg-1.2+deb12u1 | CVE-2026-5704 |
| Medium | fix deferred | tar 1.34+dfsg-1.2+deb12u1 | CVE-2026-18477, CVE-2026-18508 |
| Medium | affected | zlib1g 1:1.2.13.dfsg-1 | CVE-2026-27171 |
| Low | affected | apt 2.6.2, libapt-pkg6.0 2.6.2 | CVE-2011-3374 |
| Low | affected | bash 5.2.15-2+b13 | TEMP-0841856-B18BAF |
| Low | affected | bsdutils 1:2.38.1-5+deb12u3, libblkid1 2.38.1-5+deb12u3, libfdisk1 2.38.1-5+deb12u3, libmount1 2.38.1-5+deb12u3, libsmartcols1 2.38.1-5+deb12u3, libuuid1 2.38.1-5+deb12u3, mount 2.38.1-5+deb12u3, util-linux 2.38.1-5+deb12u3, util-linux-extra 2.38.1-5+deb12u3 | CVE-2022-0563, CVE-2025-14104 |
| Low | affected | coreutils 9.1-1 | CVE-2017-18018, CVE-2025-5278, CVE-2026-56391, CVE-2026-56392 |
| Low | will not fix | coreutils 9.1-1 | CVE-2016-2781 |
| Low | affected | dash 0.5.12-2 | CVE-2026-102473, CVE-2026-102474 |
| Low | affected | diffutils 1:3.8-4 | CVE-2026-53910 |
| Low | affected | dirmngr 2.2.40-1.1+deb12u2, gnupg 2.2.40-1.1+deb12u2, gnupg-l10n 2.2.40-1.1+deb12u2, gnupg-utils 2.2.40-1.1+deb12u2, gpg 2.2.40-1.1+deb12u2, gpg-agent 2.2.40-1.1+deb12u2, gpg-wks-client 2.2.40-1.1+deb12u2, gpg-wks-server 2.2.40-1.1+deb12u2, gpgconf 2.2.40-1.1+deb12u2, gpgsm 2.2.40-1.1+deb12u2, gpgv 2.2.40-1.1+deb12u2 | CVE-2022-3219 |
| Low | fix deferred | dirmngr 2.2.40-1.1+deb12u2, gnupg 2.2.40-1.1+deb12u2, gnupg-l10n 2.2.40-1.1+deb12u2, gnupg-utils 2.2.40-1.1+deb12u2, gpg 2.2.40-1.1+deb12u2, gpg-agent 2.2.40-1.1+deb12u2, gpg-wks-client 2.2.40-1.1+deb12u2, gpg-wks-server 2.2.40-1.1+deb12u2, gpgconf 2.2.40-1.1+deb12u2, gpgsm 2.2.40-1.1+deb12u2, gpgv 2.2.40-1.1+deb12u2 | CVE-2026-105712, CVE-2026-57062 |
| Low | affected | dmsetup 2:1.02.185-2, libdevmapper1.02.1 2:1.02.185-2 | CVE-2026-19617 |
| Low | affected | gcc-12-base 12.2.0-14+deb12u1, libgcc-s1 12.2.0-14+deb12u1, libstdc++6 12.2.0-14+deb12u1 | CVE-2022-27943 |
| Low | fix deferred | gcc-12-base 12.2.0-14+deb12u1, libgcc-s1 12.2.0-14+deb12u1, libstdc++6 12.2.0-14+deb12u1 | CVE-2026-115456 |
| Low | affected | libapparmor1 3.0.8-3 | CVE-2016-1585 |
| Low | affected | libc-bin 2.36-9+deb12u14, libc-l10n 2.36-9+deb12u14, libc6 2.36-9+deb12u14, locales 2.36-9+deb12u14 | CVE-2010-4756, CVE-2018-20796, CVE-2019-1010022, CVE-2019-1010023, CVE-2019-1010024, CVE-2019-1010025, CVE-2019-9192, CVE-2026-100290, CVE-2026-126765, CVE-2026-97399 |
| Low | affected | libgcrypt20 1.10.1-3+deb12u1 | CVE-2018-6829, CVE-2024-2236 |
| Low | affected | libgnutls30 3.7.9-2+deb12u7 | CVE-2011-3389, CVE-2026-67693, CVE-2026-88647, CVE-2026-88648, CVE-2026-95184, CVE-2026-95210 |
| Low | affected | libgssapi-krb5-2 1.20.1-2+deb12u5, libk5crypto3 1.20.1-2+deb12u5, libkrb5-3 1.20.1-2+deb12u5, libkrb5support0 1.20.1-2+deb12u5 | CVE-2018-5709, CVE-2024-26458, CVE-2024-26461, CVE-2026-11850 |
| Low | affected | libip4tc2 1.8.9-2 | CVE-2012-2663 |
| Low | affected | libldap-2.5-0 2.5.13+dfsg-5 | CVE-2015-3276, CVE-2017-14159, CVE-2017-17740, CVE-2020-15719, CVE-2026-22185 |
| Low | affected | libllvm19 1:19.1.7-3~deb12u1 | CVE-2026-13573, CVE-2026-13574 |
| Low | will not fix | libllvm19 1:19.1.7-3~deb12u1 | CVE-2024-7883 |
| Low | affected | libncursesw6 6.4-4, libtinfo6 6.4-4, ncurses-base 6.4-4, ncurses-bin 6.4-4 | CVE-2025-6141 |
| Low | affected | libperl5.36 5.36.0-7+deb12u4, perl 5.36.0-7+deb12u4, perl-base 5.36.0-7+deb12u4, perl-modules-5.36 5.36.0-7+deb12u4 | CVE-2011-4116, CVE-2023-31486 |
| Low | affected | libsasl2-2 2.1.28+dfsg-10+deb12u1, libsasl2-modules-db 2.1.28+dfsg-10+deb12u1 | CVE-2026-129483 |
| Low | affected | libsqlite3-0 3.40.1-2+deb12u2 | CVE-2021-45346, CVE-2025-29088, CVE-2025-70873, CVE-2026-119377 |
| Low | affected | libssl3 3.0.22-1~deb12u2, openssl 3.0.22-1~deb12u2 | CVE-2025-27587, CVE-2026-107493, CVE-2026-121481 |
| Low | affected | libsystemd-shared 252.39-1~deb12u2, libsystemd0 252.39-1~deb12u2, libudev1 252.39-1~deb12u2, systemd 252.39-1~deb12u2 | CVE-2013-4392, CVE-2023-31437, CVE-2023-31438, CVE-2023-31439, CVE-2026-40228 |
| Low | affected | libtasn1-6 4.19.0-2+deb12u1 | CVE-2025-13151 |
| Low | affected | libxml2 2.9.14+dfsg-1.3~deb12u6 | CVE-2026-11979 |
| Low | affected | libxslt1.1 1.1.35-1+deb12u4 | CVE-2015-9019, CVE-2025-11731 |
| Low | affected | login 1:4.13+dfsg1-1+deb12u2, passwd 1:4.13+dfsg1-1+deb12u2 | CVE-2007-5686, CVE-2024-56433, TEMP-0628843-DBAD28 |
| Low | affected | sysvinit-utils 3.06-4 | TEMP-0517018-A83CE6 |
| Low | affected | tar 1.34+dfsg-1.2+deb12u1 | CVE-2005-2541, TEMP-0290435-0B57B5 |
| Unknown | affected | dpkg 1.21.23 | CVE-2026-91094 |
| Unknown | affected | libc-bin 2.36-9+deb12u14, libc-l10n 2.36-9+deb12u14, libc6 2.36-9+deb12u14, locales 2.36-9+deb12u14 | CVE-2026-121757, CVE-2026-121758, CVE-2026-124024 |
| Unknown | affected | libgnutls30 3.7.9-2+deb12u7 | CVE-2026-127039, CVE-2026-127040, CVE-2026-127231 |
| Unknown | affected | libseccomp2 2.5.4-1+deb12u1 | TEMP-0000000-402D17, TEMP-0000000-414660, TEMP-0000000-43231F, TEMP-0000000-AE2C66, TEMP-0000000-ED49F3, TEMP-0000000-F88C7E, TEMP-0000000-FCA4C0 |
| Unknown | affected | login 1:4.13+dfsg1-1+deb12u2, passwd 1:4.13+dfsg1-1+deb12u2 | TEMP-1154946-473926 |
