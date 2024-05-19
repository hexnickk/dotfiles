#!/bin/bash

ARCH=$(uname -m)
OS=$(uname -s)

setup_local_bin() {
    mkdir -p ~/.local/bin
    echo 'export PATH=$PATH:~/.local/bin' >> ~/.zshrc
}

install_httpie() {
    if command -v http &> /dev/null; then
        echo "httpie already installed"
        return
    fi
    sudo apt install -y httpie
}

install_zellij() {
    if command -v zellij &> /dev/null; then
        echo "zellij already installed"
        return
    fi

    # Determine the system architecture and OS
    VERSION=v0.40.1

    # Define the base URL for the releases (replace with the actual URL if necessary)
    BASE_URL="https://github.com/zellij-org/zellij/releases/download/$VERSION/"

    # Function to map architecture and OS to the release filename
    get_filename() {
        local arch=$1
        local os=$2

        if [[ "$arch" == "x86_64" && "$os" == "Darwin" ]]; then
            echo "zellij-x86_64-apple-darwin.tar.gz"
        elif [[ "$arch" == "aarch64" && "$os" == "Darwin" ]]; then
            echo "zellij-aarch64-apple-darwin.tar.gz"
        elif [[ "$arch" == "x86_64" && "$os" == "Linux" ]]; then
            echo "zellij-x86_64-unknown-linux-musl.tar.gz"
        elif [[ "$arch" == "aarch64" && "$os" == "Linux" ]]; then
            echo "zellij-aarch64-unknown-linux-musl.tar.gz"
        else
            echo "Unsupported architecture or OS"
            exit 1
        fi
    }

    # Get the appropriate filename
    FILENAME=$(get_filename "$ARCH" "$OS")

    # Download the file
    if [[ "$FILENAME" != "Unsupported architecture or OS" ]]; then
        mkdir -p /tmp/zellij
        URL="$BASE_URL/$FILENAME"
        (cd /tmp/zellij && 
            echo "Downloading $URL" &&
            http --follow --download "$URL" &&
            tar -xvf "$FILENAME" &&
            mv zellij ~/.local/bin
        )
    else
        echo "No suitable release found for your system."
        exit 1
    fi
}

configure_zellij() {
    mkdir -p ~/.config/zellij
    zellij setup --dump-config > ~/.config/zellij/config.kdl
    sed -i -e 's/\/\/ default_layout "compact"/default_layout "compact"/g' ~/.config/zellij/config.kdl
}

sudo apt update

setup_local_bin

install_httpie
install_zellij
configure_zellij