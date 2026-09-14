"use client";
import { useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { useLocale } from "@/i18n/provider";
import { api } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import type { ProfileModule, User } from "@/lib/types";
import { Notice } from "./ui";
export const defaultProfileModules: ProfileModule[] = [
  "OPPORTUNITY",
  "EVENT",
  "SOCIALS",
  "LINKS",
  "REFERRAL",
].map((type) => ({ type: type as ProfileModule["type"], visible: true }));
export function ProfileModulesEditor({ user, onSaved }: { user: User; onSaved: () => void }) {
  const { t } = useLocale();
  const action = useAction();
  const [modules, setModules] = useState<ProfileModule[]>(
    user.profileModules?.length === 5 ? user.profileModules : defaultProfileModules,
  );
  function move(index: number, by: number) {
    setModules((current) => {
      const next = [...current];
      [next[index], next[index + by]] = [next[index + by]!, next[index]!];
      return next;
    });
  }
  async function save() {
    const result = await action.run(() => api("/profile/modules", { modules }), t("saved"));
    if (result) onSaved();
  }
  return (
    <section className="panel admin-section">
      <h3>{t("p2PublishModules")}</h3>
      <p className="panel-description">{t("p2ModulesIntro")}</p>
      <div className="module-editor">
        {modules.map((module, i) => (
          <div className="module-editor-row" key={module.type}>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={module.visible}
                onChange={(e) =>
                  setModules((rows) =>
                    rows.map((row, j) => (i === j ? { ...row, visible: e.target.checked } : row)),
                  )
                }
              />
              {t(`p2Module${module.type}`)}
            </label>
            <div className="module-move">
              <button
                type="button"
                className="icon-button"
                aria-label={`${t("p2MoveUp")} ${t(`p2Module${module.type}`)}`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUp size={17} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={`${t("p2MoveDown")} ${t(`p2Module${module.type}`)}`}
                disabled={i === modules.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown size={17} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="form-actions">
        <button className="button button-small" disabled={action.busy} onClick={save}>
          {t(action.busy ? "working" : "p2SaveModules")}
        </button>
      </div>
      {action.notice && <Notice message={action.notice} error={action.failed} />}
    </section>
  );
}
