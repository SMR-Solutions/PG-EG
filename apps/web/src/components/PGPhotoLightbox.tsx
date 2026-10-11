"use client";

import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";

interface Props {
  open: boolean;
  close: () => void;
  images: any[];
}

export default function PGPhotoLightbox({ open, close, images }: Props) {
  if (!open || !images || images.length === 0) return null;
  const slides = images.map((img) => ({ src: typeof img === "string" ? img : img?.url || "" }));
  return (
    <Lightbox
      open={open}
      close={close}
      slides={slides}
      plugins={[Zoom]}
      carousel={{ padding: 0 }}
      zoom={{ maxZoomPixelRatio: 3 }}
    />
  );
}
