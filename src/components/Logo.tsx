// Logo del professionista: i file nostri (public/loghi) passano da next/image, che
// li serve in formato moderno e con le dimensioni giuste. Gli URL esterni
// restano immagini semplici finché non li scarichiamo.
import Image from "next/image";

export function Logo({ src, alt = "", size = 48, className = "" }: { src: string | null; alt?: string; size?: number; className?: string }) {
  if (!src) return null;
  const cls = `object-contain ${className}`;
  if (src.startsWith("/")) {
    return <Image src={src} alt={alt} width={size} height={size} className={cls} sizes={`${size}px`} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={size} height={size} className={cls} loading="lazy" />;
}
