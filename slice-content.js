function sliceHasVisibleContent(canvas) {
  const { width, height } = canvas;
  const { data } = canvas.getContext("2d").getImageData(0, 0, width, height);
  const backgroundSamples = [[], [], [], []];

  // Use the median of a 3x3 sample so one corner speck cannot define the background.
  for (const y of [0, Math.floor(height / 2), height - 1]) {
    for (const x of [0, Math.floor(width / 2), width - 1]) {
      const offset = (y * width + x) * 4;
      const alpha = data[offset + 3];
      for (let channel = 0; channel < 3; channel += 1) {
        backgroundSamples[channel].push((255 - data[offset + channel]) * alpha / 255);
      }
      backgroundSamples[3].push(alpha);
    }
  }

  const [red, green, blue, opacity] = backgroundSamples.map((values) => values.sort((a, b) => a - b)[4]);
  const noiseBudget = Math.min(16, Math.floor(width * height / 10000));
  let differingPixels = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = data[offset + 3];
    const coverage = alpha / 255;
    const difference = Math.max(
      Math.abs(alpha - opacity),
      Math.abs((255 - data[offset]) * coverage - red),
      Math.abs((255 - data[offset + 1]) * coverage - green),
      Math.abs((255 - data[offset + 2]) * coverage - blue),
    );
    if (difference > 6) {
      differingPixels += 1;
      if (differingPixels > noiseBudget) {
        return true;
      }
    }
  }

  return false;
}

function filterVisibleSlices(candidates, render, buildName) {
  return candidates
    .filter((slice) => sliceHasVisibleContent(render(slice)))
    .map((slice, index) => ({ ...slice, index, name: buildName(index) }));
}
