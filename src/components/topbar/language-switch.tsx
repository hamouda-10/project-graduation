import { Globe, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
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
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 px-2.5 text-xs font-semibold hover:bg-accent/40 cursor-pointer"
          title="Switch Language / تغيير اللغة"
        >
          <Globe className="h-4 w-4 text-primary" />
          <span>{language === "AR" ? "العربية" : "EN"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs font-semibold">{t("language")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LANGS.map((l) => {
          const isSelected = language === l.code;
          return (
            <DropdownMenuItem
              key={l.code}
              onClick={() => handleSelect(l.code)}
              className="flex items-center justify-between cursor-pointer py-2"
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs text-primary">{l.code}</span>
                <span className="text-xs">{l.native}</span>
              </div>
              {isSelected && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
