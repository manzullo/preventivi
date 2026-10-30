-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Agency" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "website" TEXT,
    "domain" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "vatNumber" TEXT,
    "locations" JSONB,
    "whatsapp" TEXT,
    "street" TEXT,
    "postalCode" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "cityId" TEXT,
    "description" TEXT,
    "sourceDescription" TEXT,
    "foundedYear" INTEGER,
    "teamSize" TEXT,
    "minBudget" INTEGER,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "faq" JSONB,
    "industries" JSONB,
    "platforms" JSONB,
    "skills" JSONB,
    "logoUrl" TEXT,
    "googlePlaceId" TEXT,
    "googleUrl" TEXT,
    "googleSyncedAt" TIMESTAMP(3),
    "social" JSONB,
    "publishedAt" TIMESTAMP(3),
    "externalRatings" JSONB,
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scoredAt" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "importNote" TEXT,
    "sourceRef" TEXT,
    "sourceUrl" TEXT,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "claimedAt" TIMESTAMP(3),
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "optedOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Placement" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "serviceId" TEXT,
    "cityId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 10,
    "label" TEXT,
    "note" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Placement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plural" TEXT NOT NULL,
    "singular" TEXT,
    "gender" TEXT NOT NULL DEFAULT 'm',
    "group" TEXT,
    "googleMatch" TEXT,
    "intro" TEXT,
    "queries" JSONB NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceAlias" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "agencyLabel" TEXT,
    "variants" JSONB NOT NULL DEFAULT '[]',
    "intro" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyService" (
    "agencyId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "AgencyService_pkey" PRIMARY KEY ("agencyId","serviceId")
);

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "regionId" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "population" INTEGER,
    "isCapital" BOOLEAN NOT NULL DEFAULT false,
    "capitalSlug" TEXT,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "author" TEXT,
    "rating" INTEGER NOT NULL,
    "text" TEXT,
    "publishedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceRef" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceSnapshot" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "ref" TEXT,
    "data" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandingPage" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "serviceId" TEXT,
    "cityId" TEXT,
    "competitorId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "intro" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandingPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "summary" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "citySlug" TEXT,
    "services" JSONB NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedAt" TIMESTAMP(3),
    "agencyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerLogin" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerLogin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyClaim" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "role" TEXT,
    "phone" TEXT,
    "note" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Form" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "config" JSONB NOT NULL,
    "testMode" BOOLEAN NOT NULL DEFAULT false,
    "abGroup" TEXT,
    "abWeight" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormStep" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL,

    CONSTRAINT "FormStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormDraft" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "contact" JSONB,
    "lastStepKey" TEXT,
    "clientId" TEXT,
    "landingPath" TEXT,
    "converted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "contact" JSONB NOT NULL,
    "testMode" BOOLEAN NOT NULL DEFAULT false,
    "visitId" TEXT,
    "clientId" TEXT,
    "landingPath" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT,
    "formId" TEXT,
    "serviceId" TEXT,
    "cityId" TEXT,
    "budget" TEXT,
    "timing" TEXT,
    "description" TEXT,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "gclid" TEXT,
    "gbraid" TEXT,
    "wbraid" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmTerm" TEXT,
    "utmContent" TEXT,
    "matchType" TEXT,
    "device" TEXT,
    "network" TEXT,
    "landingPath" TEXT,
    "clientId" TEXT,
    "value" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "eventType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "soldPrice" INTEGER,
    "soldAt" TIMESTAMP(3),
    "adsMeta" JSONB,
    "adsEnrichedAt" TIMESTAMP(3),
    "agencyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadAssignment" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "price" INTEGER,
    "note" TEXT,
    "sentAt" TIMESTAMP(3),
    "token" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepAnalytics" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "completions" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StepAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormConversion" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gadsId" TEXT NOT NULL,
    "gadsLabel" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "customerId" TEXT,
    "conversionActionId" TEXT,
    "apiUpload" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FormConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "landingPath" TEXT,
    "referrer" TEXT,
    "clientId" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmTerm" TEXT,
    "utmContent" TEXT,
    "gclid" TEXT,
    "gbraid" TEXT,
    "wbraid" TEXT,
    "matchType" TEXT,
    "device" TEXT,
    "network" TEXT,
    "searchTerm" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ricostruita" BOOLEAN NOT NULL DEFAULT false,
    "interna" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversionUpload" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "conversionActionId" TEXT NOT NULL,
    "customerId" TEXT,
    "gclid" TEXT,
    "value" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversionUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "path" TEXT,
    "agencyId" TEXT,
    "serviceSlug" TEXT,
    "citySlug" TEXT,
    "formId" TEXT,
    "stepId" TEXT,
    "meta" JSONB,
    "sessionId" TEXT,
    "interno" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdsAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "loginCustomerId" TEXT,
    "refreshTokenEnc" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "AdsAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipients" JSONB NOT NULL,
    "formId" TEXT,
    "rules" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "leadId" TEXT,
    "status" TEXT NOT NULL,
    "payload" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Redirect" (
    "id" TEXT NOT NULL,
    "fromPath" TEXT NOT NULL,
    "toPath" TEXT,
    "status" INTEGER NOT NULL DEFAULT 301,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Redirect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'static',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "body" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangelogEntry" (
    "id" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "subject" TEXT,
    "diff" JSONB,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangelogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebugLog" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebugLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "password" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "impronta" TEXT NOT NULL,
    "prefisso" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "attiva" BOOLEAN NOT NULL DEFAULT true,
    "ultimoUso" TIMESTAMP(3),
    "chiamate" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revocataIl" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthCode" (
    "id" TEXT NOT NULL,
    "codice" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "codeChallenge" TEXT,
    "email" TEXT NOT NULL,
    "scadenza" TIMESTAMP(3) NOT NULL,
    "usato" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agency_slug_key" ON "Agency"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Agency_googlePlaceId_key" ON "Agency"("googlePlaceId");

-- CreateIndex
CREATE INDEX "Agency_cityId_published_idx" ON "Agency"("cityId", "published");

-- CreateIndex
CREATE INDEX "Agency_domain_idx" ON "Agency"("domain");

-- CreateIndex
CREATE INDEX "Agency_score_idx" ON "Agency"("score");

-- CreateIndex
CREATE INDEX "Agency_priority_idx" ON "Agency"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "Agency_source_sourceRef_key" ON "Agency"("source", "sourceRef");

-- CreateIndex
CREATE INDEX "Placement_serviceId_cityId_priority_idx" ON "Placement"("serviceId", "cityId", "priority");

-- CreateIndex
CREATE INDEX "Placement_agencyId_idx" ON "Placement"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "Service_slug_key" ON "Service"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceAlias_slug_key" ON "ServiceAlias"("slug");

-- CreateIndex
CREATE INDEX "ServiceAlias_serviceId_published_idx" ON "ServiceAlias"("serviceId", "published");

-- CreateIndex
CREATE INDEX "AgencyService_serviceId_idx" ON "AgencyService"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Region_slug_key" ON "Region"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "City_slug_key" ON "City"("slug");

-- CreateIndex
CREATE INDEX "City_regionId_idx" ON "City"("regionId");

-- CreateIndex
CREATE INDEX "City_capitalSlug_idx" ON "City"("capitalSlug");

-- CreateIndex
CREATE INDEX "City_isCapital_idx" ON "City"("isCapital");

-- CreateIndex
CREATE UNIQUE INDEX "Review_sourceRef_key" ON "Review"("sourceRef");

-- CreateIndex
CREATE INDEX "Review_agencyId_idx" ON "Review"("agencyId");

-- CreateIndex
CREATE INDEX "SourceSnapshot_source_ref_idx" ON "SourceSnapshot"("source", "ref");

-- CreateIndex
CREATE UNIQUE INDEX "SourceSnapshot_agencyId_source_key" ON "SourceSnapshot"("agencyId", "source");

-- CreateIndex
CREATE INDEX "Photo_agencyId_idx" ON "Photo"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "LandingPage_path_key" ON "LandingPage"("path");

-- CreateIndex
CREATE INDEX "LandingPage_kind_published_idx" ON "LandingPage"("kind", "published");

-- CreateIndex
CREATE UNIQUE INDEX "Competitor_slug_key" ON "Competitor"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Application_agencyId_key" ON "Application"("agencyId");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerLogin_token_key" ON "OwnerLogin"("token");

-- CreateIndex
CREATE INDEX "OwnerLogin_agencyId_idx" ON "OwnerLogin"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyClaim_token_key" ON "AgencyClaim"("token");

-- CreateIndex
CREATE INDEX "AgencyClaim_agencyId_idx" ON "AgencyClaim"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "Form_slug_key" ON "Form"("slug");

-- CreateIndex
CREATE INDEX "FormStep_formId_position_idx" ON "FormStep"("formId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "FormStep_formId_key_key" ON "FormStep"("formId", "key");

-- CreateIndex
CREATE INDEX "FormDraft_converted_updatedAt_idx" ON "FormDraft"("converted", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FormDraft_formId_sessionId_key" ON "FormDraft"("formId", "sessionId");

-- CreateIndex
CREATE INDEX "Submission_formId_createdAt_idx" ON "Submission"("formId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_submissionId_key" ON "Lead"("submissionId");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "Lead_agencyId_idx" ON "Lead"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadAssignment_token_key" ON "LeadAssignment"("token");

-- CreateIndex
CREATE INDEX "LeadAssignment_agencyId_status_idx" ON "LeadAssignment"("agencyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LeadAssignment_leadId_agencyId_key" ON "LeadAssignment"("leadId", "agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "StepAnalytics_formId_stepId_day_key" ON "StepAnalytics"("formId", "stepId", "day");

-- CreateIndex
CREATE INDEX "FormConversion_formId_idx" ON "FormConversion"("formId");

-- CreateIndex
CREATE INDEX "Visit_sessionId_idx" ON "Visit"("sessionId");

-- CreateIndex
CREATE INDEX "Visit_gclid_idx" ON "Visit"("gclid");

-- CreateIndex
CREATE INDEX "Visit_createdAt_idx" ON "Visit"("createdAt");

-- CreateIndex
CREATE INDEX "ConversionUpload_status_idx" ON "ConversionUpload"("status");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_type_createdAt_idx" ON "AnalyticsEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_agencyId_idx" ON "AnalyticsEvent"("agencyId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_formId_idx" ON "AnalyticsEvent"("formId");

-- CreateIndex
CREATE UNIQUE INDEX "AdsAccount_customerId_key" ON "AdsAccount"("customerId");

-- CreateIndex
CREATE INDEX "NotificationLog_notificationId_createdAt_idx" ON "NotificationLog"("notificationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Redirect_fromPath_key" ON "Redirect"("fromPath");

-- CreateIndex
CREATE UNIQUE INDEX "Page_slug_key" ON "Page"("slug");

-- CreateIndex
CREATE INDEX "Page_kind_published_idx" ON "Page"("kind", "published");

-- CreateIndex
CREATE INDEX "ChangelogEntry_area_createdAt_idx" ON "ChangelogEntry"("area", "createdAt");

-- CreateIndex
CREATE INDEX "DebugLog_area_createdAt_idx" ON "DebugLog"("area", "createdAt");

-- CreateIndex
CREATE INDEX "DebugLog_level_createdAt_idx" ON "DebugLog"("level", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_impronta_key" ON "ApiKey"("impronta");

-- CreateIndex
CREATE INDEX "ApiKey_attiva_idx" ON "ApiKey"("attiva");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthCode_codice_key" ON "OAuthCode"("codice");

-- CreateIndex
CREATE INDEX "OAuthCode_scadenza_idx" ON "OAuthCode"("scadenza");

-- AddForeignKey
ALTER TABLE "Agency" ADD CONSTRAINT "Agency_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceAlias" ADD CONSTRAINT "ServiceAlias_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyService" ADD CONSTRAINT "AgencyService_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyService" ADD CONSTRAINT "AgencyService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "City" ADD CONSTRAINT "City_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceSnapshot" ADD CONSTRAINT "SourceSnapshot_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingPage" ADD CONSTRAINT "LandingPage_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingPage" ADD CONSTRAINT "LandingPage_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingPage" ADD CONSTRAINT "LandingPage_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerLogin" ADD CONSTRAINT "OwnerLogin_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyClaim" ADD CONSTRAINT "AgencyClaim_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormStep" ADD CONSTRAINT "FormStep_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormDraft" ADD CONSTRAINT "FormDraft_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadAssignment" ADD CONSTRAINT "LeadAssignment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadAssignment" ADD CONSTRAINT "LeadAssignment_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepAnalytics" ADD CONSTRAINT "StepAnalytics_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepAnalytics" ADD CONSTRAINT "StepAnalytics_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "FormStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormConversion" ADD CONSTRAINT "FormConversion_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversionUpload" ADD CONSTRAINT "ConversionUpload_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

