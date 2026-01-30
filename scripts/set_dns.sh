#!/bin/bash

# Function to reset DNS to default (use router's DNS settings)
set_default_dns() {
    echo "Resetting DNS to use router (default)"
    networksetup -setdnsservers Wi-Fi "Empty"
}

# Function to set DNS to public servers
set_public_dns() {
    echo "Setting DNS to use public servers: 8.8.8.8 and 1.1.1.1"
    networksetup -setdnsservers Wi-Fi 8.8.8.8 1.1.1.1
}

# Check for argument
if [ "$1" == "default" ]; then
    set_default_dns
elif [ "$1" == "public" ]; then
    set_public_dns
else
    echo "Usage: $0 {default|public}"
    exit 1
fi
