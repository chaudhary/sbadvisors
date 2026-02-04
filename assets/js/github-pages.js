(function () {
	if (!window.location.hostname.endsWith("github.io")) {
		return;
	}

	var parts = window.location.pathname.split("/").filter(Boolean);
	var prefix = parts.length ? "/" + parts[0] : "";
	var origin = window.location.origin;

	var fixUrl = function (url) {
		if (!url) return url;

		if (url.startsWith(origin + "/")) {
			var relative = url.slice(origin.length);
			if (prefix && !relative.startsWith(prefix + "/")) {
				return origin + prefix + relative;
			}
			return url;
		}

		if (url[0] !== "/" || url.startsWith("//")) {
			return url;
		}

		if (prefix && !url.startsWith(prefix + "/")) {
			return prefix + url;
		}
		return url;
	};

	var fixSrcset = function (value) {
		if (!value) return value;
		return value
			.split(",")
			.map(function (part) {
				var seg = part.trim().split(/\s+/);
				seg[0] = fixUrl(seg[0]);
				return seg.join(" ");
			})
			.join(", ");
	};

	var applyFixes = function () {
		document.querySelectorAll("[href]").forEach(function (el) {
			var href = el.getAttribute("href");
			var fixed = fixUrl(href);
			if (fixed !== href) el.setAttribute("href", fixed);
		});

		document.querySelectorAll("[src]").forEach(function (el) {
			var src = el.getAttribute("src");
			var fixed = fixUrl(src);
			if (fixed !== src) el.setAttribute("src", fixed);
		});

		document.querySelectorAll("[srcset]").forEach(function (el) {
			var srcset = el.getAttribute("srcset");
			var fixed = fixSrcset(srcset);
			if (fixed !== srcset) el.setAttribute("srcset", fixed);
		});
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", applyFixes);
	} else {
		applyFixes();
	}
})();
