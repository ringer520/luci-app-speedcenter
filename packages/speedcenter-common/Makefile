include $(TOPDIR)/rules.mk

PKG_NAME:=speedcenter-common
PKG_VERSION:=0.1.0
PKG_RELEASE:=1

PKG_MAINTAINER:=SpeedCenter contributors
PKG_LICENSE:=Apache-2.0

include $(INCLUDE_DIR)/package.mk

define Package/speedcenter-common
  SECTION:=net
  CATEGORY:=Network
  TITLE:=SpeedCenter measurement engine
  DEPENDS:=+rpcd-mod-ucode +ucode +ucode-mod-fs +ucode-mod-uci +jsonfilter +jshn +curl +coreutils-timeout
  PKGARCH:=all
endef

define Package/speedcenter-common/description
  Router-side domestic and international speed test plus website latency
  probing engine. Exposes ubus methods and keeps bounded JSONL history.
  Measurement engines are optional: Ookla speedtest, librespeed-cli,
  speedtestcpp. HTTPS latency probes use curl.
endef

define Package/speedcenter-common/conffiles
/etc/config/speedcenter
endef

# rpcd enumerates its ucode plugins only at startup, so the ubus object
# appears or disappears on reload rather than when the file is installed.
define Package/speedcenter-common/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] && exit 0
rm -f /tmp/luci-indexcache* /tmp/luci-modulecache/* 2>/dev/null
/etc/init.d/rpcd restart >/dev/null 2>&1
/etc/init.d/uhttpd restart >/dev/null 2>&1
exit 0
endef

define Package/speedcenter-common/postrm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] && exit 0
rm -f /tmp/luci-indexcache* /tmp/luci-modulecache/* 2>/dev/null
/etc/init.d/rpcd restart >/dev/null 2>&1
/etc/init.d/uhttpd restart >/dev/null 2>&1
exit 0
endef

# No source archive to unpack or compile: everything under ./files is shipped
# directly into the target rootfs.
define Build/Prepare
endef

define Build/Compile
endef

define Package/speedcenter-common/install
	$(INSTALL_DIR) $(1)/usr/libexec
	$(INSTALL_BIN) ./files/speedcenter-run $(1)/usr/libexec/speedcenter-run
	$(INSTALL_DIR) $(1)/usr/share/rpcd/ucode
	$(INSTALL_DATA) ./files/speedcenter.uc $(1)/usr/share/rpcd/ucode/speedcenter.uc
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/speedcenter.config $(1)/etc/config/speedcenter
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/speedcenter.init $(1)/etc/init.d/speedcenter
	$(INSTALL_DIR) $(1)/usr/share/speedcenter
	$(INSTALL_DATA) ./files/servers-cn.example.json $(1)/usr/share/speedcenter/servers-cn.example.json
	$(INSTALL_DATA) ./files/servers-global.example.json $(1)/usr/share/speedcenter/servers-global.example.json
endef

$(eval $(call BuildPackage,speedcenter-common))
