Best available package for Amazon Linux 2023
https://mirror.stream.centos.org/9-stream/AppStream/x86_64/os/Packages/soundtouch-2.1.1-8.el9.x86_64.rpm

---

Building on Amazon Linux 2023

```ahell
yum install -y git
git clone https://codeberg.org/soundtouch/soundtouch.git
cd soundtouch

dnf install automake autoconf libtool gcc gcc-c++ make kernel-devel

./bootstrap
./configure
make
make install

# Check
/usr/local/bin/soundstretch

```
