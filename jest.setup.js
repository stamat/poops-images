import sharp from 'sharp'

// Windows: libvips cache keeps input file descriptors open after processing,
// making fixture cleanup fail with EBUSY on unlink. Disable it in tests.
sharp.cache(false)
