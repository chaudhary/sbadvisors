(function () {
	if (!window.location.hostname.endsWith("github.io")) {
		return;
	}

	var prefix = "/sbadvisors";
	var fixUrl = function (url) {
		if (!url || url[0] !== "/" || url.startsWith("//") || url.startsWith(prefix + "/")) {
			return url;
		}
		return prefix + url;
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
})();
