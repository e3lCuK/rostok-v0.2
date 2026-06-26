import { Award, Crown, Gem, Star, BadgeCheck, Flame, Ribbon, Zap } from "lucide-react";

const icons = [
  { name: "Award", Icon: Award },
  { name: "Crown", Icon: Crown },
  { name: "Gem", Icon: Gem },
  { name: "Star", Icon: Star },
  { name: "BadgeCheck", Icon: BadgeCheck },
  { name: "Flame", Icon: Flame },
  { name: "Ribbon", Icon: Ribbon },
  { name: "Zap", Icon: Zap },
];

export default function IconPreview() {
  return (
    <div style={{
      background: "#ecfccb",
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "16px",
        padding: "24px",
      }}>
        {icons.map(({ name, Icon }) => (
          <div key={name} style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            background: "white",
            borderRadius: "14px",
            padding: "20px 16px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            minWidth: "80px",
          }}>
            <Icon size={28} color="#4a7c2f" strokeWidth={1.8} />
            <span style={{ fontSize: "11px", color: "#666", fontWeight: 500 }}>{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
