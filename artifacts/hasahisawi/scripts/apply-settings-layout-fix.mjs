import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(process.cwd(), 'app/(tabs)/settings.tsx');
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  '  actionBtn: {\n    flexDirection: "row-reverse",\n    alignItems: "center",\n    backgroundColor: Colors.surface1,\n    borderRadius: 14,\n    borderWidth: 1,\n    borderColor: "#E74C3C20",\n    paddingHorizontal: 14,\n    paddingVertical: 12,\n    gap: 0,\n  },',
  '  actionBtn: {\n    flexDirection: "row-reverse",\n    alignItems: "center",\n    backgroundColor: Colors.surface1,\n    borderRadius: 14,\n    borderWidth: 1,\n    borderColor: "#E74C3C20",\n    paddingHorizontal: 14,\n    paddingVertical: 12,\n    gap: 12,\n    minHeight: 82,\n  },'
);

src = src.replace(
  '  actionTitle: {\n    fontFamily: "Cairo_700Bold", fontSize: 14,\n    color: Colors.textPrimary, textAlign: "right",\n  },',
  '  actionTitle: {\n    fontFamily: "Cairo_700Bold", fontSize: 14,\n    color: Colors.textPrimary, textAlign: "right",\n    lineHeight: 22,\n    flexShrink: 1,\n  },'
);

src = src.replace(
  '  actionSub: {\n    fontFamily: "Cairo_400Regular", fontSize: 11,\n    color: Colors.textMuted, textAlign: "right",\n    marginTop: 1,\n  },',
  '  actionSub: {\n    fontFamily: "Cairo_400Regular", fontSize: 11,\n    color: Colors.textMuted, textAlign: "right",\n    marginTop: 2,\n    lineHeight: 18,\n    flexShrink: 1,\n  },'
);

src = src.replace(
  '  btnRow: { flexDirection: "row-reverse", gap: 10 },',
  '  btnRow: { flexDirection: "row-reverse", gap: 10, flexWrap: "wrap" },'
);

src = src.replace(
  '  infoText: {\n    fontFamily: "Cairo_400Regular", fontSize: 11,\n    color: Colors.textMuted, textAlign: "center",\n    letterSpacing: 0.3,\n  },',
  '  infoText: {\n    fontFamily: "Cairo_400Regular", fontSize: 11,\n    color: Colors.textMuted, textAlign: "center",\n    letterSpacing: 0.3,\n    lineHeight: 18,\n    flexShrink: 1,\n  },'
);

src = src.replace(
  '  card: {\n    backgroundColor: Colors.cardBg,\n    borderRadius: 16, borderWidth: 1,\n    borderColor: "#10B98125",\n    padding: 16, gap: 10,\n  },',
  '  card: {\n    backgroundColor: Colors.cardBg,\n    borderRadius: 16, borderWidth: 1,\n    borderColor: "#10B98125",\n    padding: 16, gap: 14,\n    marginTop: 12,\n    marginBottom: 24,\n  },'
);

src = src.replace(
  '  btn: {\n    flexDirection: "row-reverse", alignItems: "center",\n    backgroundColor: Colors.surface1 ?? Colors.bg,\n    borderRadius: 13, borderWidth: 1, borderColor: "#10B98120",\n    paddingHorizontal: 14, paddingVertical: 12,\n  },',
  '  btn: {\n    flexDirection: "row-reverse", alignItems: "center",\n    backgroundColor: Colors.surface1 ?? Colors.bg,\n    borderRadius: 13, borderWidth: 1, borderColor: "#10B98120",\n    paddingHorizontal: 14, paddingVertical: 12,\n    minHeight: 76,\n  },'
);

src = src.replace(
  '  btnTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },',
  '  btnTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right", lineHeight: 22, flexShrink: 1 },'
);

src = src.replace(
  '  btnSub:   { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginTop: 1 },',
  '  btnSub:   { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginTop: 2, lineHeight: 18, flexShrink: 1 },'
);

src = src.replace(
  '  infoTxt:  { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right", flex: 1 },',
  '  infoTxt:  { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right", flex: 1, lineHeight: 18, flexShrink: 1 },'
);

fs.writeFileSync(file, src);
console.log('settings layout fix applied');
