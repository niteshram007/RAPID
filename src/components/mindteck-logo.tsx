import Image from "next/image";

type MindteckLogoProps = {
  className?: string;
  priority?: boolean;
};

export function MindteckLogo({
  className = "",
  priority = false,
}: MindteckLogoProps) {
  return (
    <Image
      src="/logo.png"
      alt="Mindteck"
      width={900}
      height={192}
      priority={priority}
      className={className}
    />
  );
}
