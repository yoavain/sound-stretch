#!/bin/bash -x

# Exit on error
set -e

# Create output directory if it doesn't exist
mkdir -p /home/soundtouch-out

# Install dependencies for Amazon Linux 2023
dnf install -y git gcc gcc-c++ make kernel-devel automake autoconf libtool glibc-static libstdc++-static

# Clone source
rm -rf soundtouch
git clone https://codeberg.org/soundtouch/soundtouch.git
cd soundtouch

# Bootstrap and configure with static flags
./bootstrap

# Configure with static linking and explicit paths
export CFLAGS="-static"
export CXXFLAGS="-static"
export LDFLAGS="-static -pthread"

./configure --enable-static --disable-shared --prefix=/usr/local

# Build
make clean || true
make LDFLAGS="-static -pthread -all-static" || true

# Copy artifact to mounted volume
echo Copying artifact
ls -lart /home/soundtouch/source/SoundStretch/soundstretch
cp /home/soundtouch/source/SoundStretch/soundstretch /home/soundtouch-out
