// The HyperFrames helper scripts (animation-map, contrast-report) use @hyperframes/producer, which depends on
// puppeteer. Rendering uses the Chrome that `hyperframes browser ensure` installs, so skip puppeteer's own download.
module.exports = { skipDownload: true };
