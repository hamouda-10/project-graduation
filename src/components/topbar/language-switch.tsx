import { Globe, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUIStore } from "@/stores/ui-store";
import { useTranslation, type LanguageCode } from "@/lib/i18n";

const LANGS: { code: LanguageCode; label: string; native: string }[] = [
  { code: "EN", label: "English", native: "English (US)" },
  { code: "AR", label: "العربية", native: "العربية (RTL)" },
];

export function LanguageSwitch() {
  const language = useUIStore((s) => s.language);
  const setUiLanguage = useUIStore((s) => s.setLanguage);
  const { setLanguage: setI18nLanguage, t } = useTranslation();

  const handleSelect = (code: LanguageCode) => {
    setUiLanguage(code);
    setI18nLanguage(code);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 items-center gap-1.5 px-3 rounded-lg border border-amber-500/25 bg-zinc-950/80 text-xs font-semibold text-amber-300 transition-all hover:border-amber-500/50 hover:bg-zinc-900 cursor-pointer shadow-sm"
          title="Switch Language / تغيير اللغة"
        >
          <Globe className="h-4 w-4 text-amber-400" />
          <span>{language === "AR" ? "العربية" : "EN"}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-44 p-1 bg-zinc-950/95 border-amber-500/40 backdrop-blur-xl"
      >
        <DropdownMenuLabel className="px-2 py-1 text-[10.5px] font-bold uppercase tracking-wider text-amber-400/90">
          {t("language")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-1 bg-amber-500/20" />
        {LANGS.map((l) => {
          const isSelected = language === l.code;
          return (
            <DropdownMenuItem
              key={l.code}
              onClick={() => handleSelect(l.code)}
              className="flex items-center justify-between cursor-pointer px-2 py-1.5 rounded-md hover:bg-amber-500/10 hover:text-amber-300"
            >
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-amber-400">{l.code}</span>
                <span className="text-xs">{l.native}</span>
              </div>
              {isSelected && <Check className="h-3.5 w-3.5 text-amber-400" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
