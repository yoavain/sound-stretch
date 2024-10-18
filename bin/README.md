Best available package for Amazon Linux 2023
https://mirror.stream.centos.org/9-stream/AppStream/x86_64/os/Packages/soundtouch-2.1.1-8.el9.x86_64.rpm

---

Building on Amazon Linux 2023

```ahell
#!/bin/bash
set -e  # Exit on error

# Install dependencies for Amazon Linux 2023
dnf install -y git gcc gcc-c++ make kernel-devel automake autoconf libtool glibc-static libstdc++-static

# Clone source
rm -rf soundtouch
git clone https://codeberg.org/soundtouch/soundtouch.git
cd soundtouch

# Bootstrap and configure with static flags
./bootstrap

# Configure
./configure

# Build
make
make install

echo "Build complete. Binary location: /usr/local/bin/soundstretch"
```

---

Build static 

```shell
#!/bin/bash
set -e  # Exit on error

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
make LDFLAGS="-static -pthread -all-static"

# The binary will be in soundstretch/soundstretch
# Strip the binary to reduce size
strip soundstretch/soundstretch

# Test if it's statically linked
file soundstretch/soundstretch

# Copy to a known location
cp soundstretch/soundstretch /usr/local/bin/soundstretch-static

echo "Build complete. Binary location: /usr/local/bin/soundstretch-static"
```

Output location:
```
/home/soundtouch/source/SoundStretch/soundstretch
```
