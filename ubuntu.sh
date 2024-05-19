#!/bin/bash

ARCH=$(uname -m)
OS=$(uname -s)

setup_local_bin() {
    mkdir -p ~/.local/bin
    echo 'export PATH=$PATH:~/.local/bin' >> ~/.zshrc
}

bootstrap_httpie() {
    if command -v http &> /dev/null; then
        echo "httpie already installed"
        return
    fi

    sudo apt install -y httpie
}

install_zellij() {
    VERSION=v0.40.1
    BASE_URL="https://github.com/zellij-org/zellij/releases/download/$VERSION/"
    FILENAME="zellij-$ARCH-unknown-linux-musl.tar.gz"
    URL="$BASE_URL/$FILENAME"

    mkdir -p /tmp/zellij
    (cd /tmp/zellij && 
        http --follow --download "$URL" &&
        tar -xvf "$FILENAME" &&
        mv zellij ~/.local/bin
    )
}

configure_zellij() {
    mkdir -p ~/.config/zellij
    zellij setup --dump-config > ~/.config/zellij/config.kdl
    sed -i -e 's/\/\/ default_layout "compact"/default_layout "compact"/g' ~/.config/zellij/config.kdl
}

bootstrap_zellij() {
    if command -v zellij &> /dev/null; then
        echo "zellij already installed"
        return
    fi
    install_zellij
    configure_zellij
}

install_fzf() {
    VERSION=0.52.1
    BASE_URL="https://github.com/junegunn/fzf/releases/download/$VERSION"

    get_arch() {
        case "$ARCH" in
            "x86_64") echo "amd64" ;;
            "arm64" | "aarch64") echo "arm64" ;;
            *) echo "$ARCH"
        esac
    }
    ARCH=$(get_arch)
    FILENAME="fzf-$VERSION-linux_$ARCH.tar.gz"
    URL="$BASE_URL/$FILENAME"

    mkdir -p /tmp/fzf
    (cd /tmp/fzf && 
        http --follow --download "$URL" &&
        tar -xvf "$FILENAME" &&
        mv fzf ~/.local/bin
    )
}

configure_fzf() {
    echo "# fzf
source <(fzf --zsh)
" >> ~/.zshrc
}

bootstrap_fzf() {
    if command -v fzf &> /dev/null; then
        echo "fzf already installed"
        return
    fi

    install_fzf
    configure_fzf
}

sudo apt update

setup_local_bin

bootstrap_httpie
bootstrap_zellij
bootstrap_fzf
