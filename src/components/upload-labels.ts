import type { FileUploadLabels } from "@/components/ui/file-upload";
import type { Translator } from "@/core/i18n/translator";

/** Learner-facing labels for <FileUpload> in the current language. */
export function uploadLabels(t: Translator): FileUploadLabels {
  return {
    choose: t.t("upload.choose"),
    drop: t.t("upload.drop"),
    uploading: t.t("upload.uploading"),
    remove: t.t("upload.remove"),
    errors: {
      too_large: t.t("upload.errorTooLarge"),
      type_not_allowed: t.t("upload.errorType"),
      invalid_content: t.t("upload.errorInvalid"),
      too_many: t.t("upload.errorTooMany"),
      rate_limited: t.t("upload.errorRateLimited"),
      failed: t.t("upload.errorFailed"),
    },
  };
}
