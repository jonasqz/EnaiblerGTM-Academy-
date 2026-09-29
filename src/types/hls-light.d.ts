// hls.js ships its light build (no HLS subtitles, alternate audio or DRM) without types of its own.
declare module "hls.js/light" {
  export * from "hls.js";
  export { default } from "hls.js";
}
