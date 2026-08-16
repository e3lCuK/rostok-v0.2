import rostokTree from "@/assets/rostok-tree.png";

interface Props {
  size?: number;
  className?: string;
  alt?: string;
}

/** Brand tree mark used on landing / auth / tutorial. */
export default function RostokTreeIcon({
  size = 48,
  className,
  alt = "",
}: Props) {
  return (
    <img
      src={rostokTree}
      width={size}
      height={size}
      className={className}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      draggable={false}
      style={{ objectFit: "contain" }}
    />
  );
}
