#!/usr/bin/env bash
set -euo pipefail

mkdir -p .repos

clone() {
  local dir="$1" remote="$2" branch="$3"
  if [ -d ".repos/$dir" ]; then
    echo "skip: .repos/$dir already exists"
  else
    echo "clone: $remote -> .repos/$dir (branch: $branch)"
    git clone --depth 1 --branch "$branch" "$remote" ".repos/$dir"
  fi
}

clone consultation_v2          git@github.com:radixdlt/consultation_v2.git      main
clone radix-dapp-toolkit       https://github.com/radixdlt/radix-dapp-toolkit   main
clone radix-docs               git@github.com:gguuttss/radix-docs.git           master
clone radix-gateway-api-rust   git@github.com:ociswap/radix-client.git          main
clone radixdlt-scrypto         git@github.com:radixdlt/radixdlt-scrypto.git     develop
clone rola                     git@github.com:radixdlt/rola.git                 main
clone tanstack-router          git@github.com:TanStack/router.git               main
clone effect                   git@github.com:Effect-TS/effect.git              main
clone radix-web3.js            git@github.com:xstelea/radix-web3.js.git        subintent
clone radix-engine-toolkit     git@github.com:xstelea/radix-engine-toolkit.git  main
clone typescript-radix-engine-toolkit git@github.com:xstelea/typescript-radix-engine-toolkit.git main
clone multisig                 git@github.com:xstelea/multisig.git             main

echo "done: all repos in .repos/"