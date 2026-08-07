-- Create PortalSetting table for admin-editable settings
CREATE TABLE "PortalSetting" (
    "key"         TEXT NOT NULL,
    "value"       TEXT NOT NULL,
    "isPublic"    BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    CONSTRAINT "PortalSetting_pkey" PRIMARY KEY ("key")
);

-- Seed the default download warning message (public, visible to clients)
INSERT INTO "PortalSetting" ("key", "value", "isPublic", "description", "updatedAt") VALUES
  (
    'download_warning_macro',
    'This is a macro-enabled workbook. Windows and macOS block macros on files downloaded from the web. To enable them: Windows — right-click the downloaded file → Properties → tick Unblock → OK, then open in Excel. If Excel shows a yellow "Enable Content" bar at the top, click it.',
    true,
    'Warning banner shown to clients on the download page for macro-enabled files (.xlsm, .xlsb, .docm, .pptm)',
    NOW()
  );
