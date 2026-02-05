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

	var fixElement = function (el) {
		if (!el || el.nodeType !== 1) return;

		if (el.hasAttribute("href")) {
			var href = el.getAttribute("href");
			var fixedHref = fixUrl(href);
			if (fixedHref !== href) el.setAttribute("href", fixedHref);
		}

		if (el.hasAttribute("src")) {
			var src = el.getAttribute("src");
			var fixedSrc = fixUrl(src);
			if (fixedSrc !== src) el.setAttribute("src", fixedSrc);
		}

		if (el.hasAttribute("srcset")) {
			var srcset = el.getAttribute("srcset");
			var fixedSrcset = fixSrcset(srcset);
			if (fixedSrcset !== srcset) el.setAttribute("srcset", fixedSrcset);
		}
	};

	var applyFixes = function (root) {
		var scope = root || document;
		if (scope.querySelectorAll) {
			scope.querySelectorAll("[href], [src], [srcset]").forEach(fixElement);
		}
	};

	var observeMutations = function () {
		if (!window.MutationObserver) return;
		var observer = new MutationObserver(function (mutations) {
			mutations.forEach(function (mutation) {
				if (mutation.type === "attributes") {
					fixElement(mutation.target);
					return;
				}
				mutation.addedNodes.forEach(function (node) {
					fixElement(node);
					applyFixes(node);
				});
			});
		});

		observer.observe(document.documentElement, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: ["href", "src", "srcset"]
		});
	};

	applyFixes(document);
	observeMutations();
})();
