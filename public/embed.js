/*
 * The academy on your website. Put this where it should appear:
 *
 *   <script src="https://<your academy>/embed.js" data-lang="de"
 *     data-utm-source="website" data-title="Learning paths" async></script>
 *
 * It adds an iframe from the academy that loaded it and keeps the iframe as
 * tall as its content. Nothing is stored in the visitor's browser; a choice
 * opens the academy in a new tab. Optional: data-utm-medium, -campaign,
 * -term, -content, and data-heading="off" to leave out the heading.
 *
 * With data-webinar="<webinar address>" it shows that webinar's
 * registration form instead of the path picker.
 */
(function () {
  var script = document.currentScript;
  if (!script || !script.src || !script.parentNode) return;
  var origin = new URL(script.src).origin;
  var data = script.dataset;
  var webinar = data.webinar && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.webinar) ? data.webinar : "";
  var params = new URLSearchParams();
  if (data.lang) params.set("lang", data.lang);
  if (data.heading === "off") params.set("heading", "0");
  ["source", "medium", "campaign", "term", "content"].forEach(function (key) {
    var value = data["utm" + key.charAt(0).toUpperCase() + key.slice(1)];
    if (value) params.set("utm_" + key, value);
  });
  var query = params.toString();
  var frame = document.createElement("iframe");
  var path = webinar ? "/embed/webinars/" + webinar : "/embed/paths";
  frame.src = origin + path + (query ? "?" + query : "");
  frame.title = data.title || (webinar ? "Webinar registration" : "Learning paths");
  frame.loading = "lazy";
  frame.setAttribute("style", "display:block;width:100%;height:420px;border:0;overflow:hidden");
  script.parentNode.insertBefore(frame, script);
  window.addEventListener("message", function (event) {
    if (event.origin !== origin || event.source !== frame.contentWindow) return;
    var message = event.data;
    if (message && message.type === "enaibler:embed-height" && message.height > 0) {
      frame.style.height = Math.min(Math.ceil(message.height), 10000) + "px";
    }
  });
})();
