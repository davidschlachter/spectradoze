# spectradoze
Noise spectrum generator for the web (Javascript, HTML), inspired by the Android app [ChromaDoze](https://github.com/pmarks-net/chromadoze#readme).

Live at https://schlachter.ca/spectradoze/

Automatically generates colored noise based on the sketched frequency / amplitude curve. Works by generating a 30-second sample of white noise with the Web Audio API and shaping it through a series of BiquadFilter equalizers for each frequency band. The resulting audio is looped, and regenerated when the curve is modified.

Intended for use as a sleep sound generator, especially on iOS.