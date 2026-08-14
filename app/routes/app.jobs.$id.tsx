import { useEffect, useState, useCallback, useRef } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate, useRevalidator } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  ProgressBar,
  IndexTable,
  Thumbnail,
  useIndexResourceState,
  Checkbox,
  Box,
  Tag,
  Divider,
  Banner,
  TextField,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { Prisma } from "@prisma/client";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { LANGUAGE_NAMES } from "../services/vision.server";
import { parseTagFilter, describeTagFilter } from "../services/products.server";
import { logger } from "../services/logger.server";

const SYNC_BATCH_SIZE = 50;

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const { id } = params;

  if (!id) {
    throw new Response("Job ID required", { status: 400 });
  }

  // Scoped to the authenticated shop — a job UUID alone must not grant access
  const job = await prisma.job.findFirst({
    where: { id, shop },
    include: {
      products: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!job) {
    throw new Response("Job not found", { status: 404 });
  }

  const analyzedCount = job.products.filter((p) => p.status === "ANALYZED").length;
  const syncedCount = job.products.filter((p) => p.status === "SYNCED").length;
  logger.info("JOB_DETAIL_VIEWED", {
    shop,
    jobId: id,
    jobStatus: job.status,
    totalItems: job.totalItems,
    analyzed: analyzedCount,
    synced: syncedCount,
  });

  return json({
    job: {
      id: job.id,
      status: job.status,
      totalItems: job.totalItems,
      processed: job.processed,
      createdAt: job.createdAt.toISOString(),
      syncedCount,
      // What this run was scoped to and which tag style it used. Both are
      // snapshot on the job, so they stay accurate even after settings change.
      tagFormat: job.tagFormat,
      tagFilterLabel: job.tagFilter ? describeTagFilter(parseTagFilter(job.tagFilter)) : null,
    },
    products: job.products.map((p) => ({
      id: p.id,
      title: p.title,
      imageUrl: p.imageUrl,
      status: p.status,
      currentCategory: p.currentCategory,
      currentTags: p.currentTags,
      suggestedMetafields: p.suggestedMetafields as Record<string, string> | null,
      suggestedTags: p.suggestedTags as string[] | null,
      suggestedDescription: p.suggestedDescription,
      suggestedSeoTitle: p.suggestedSeoTitle,
      suggestedMetaDescription: p.suggestedMetaDescription,
      hasOriginalData: !!(p.originalDescription || p.originalSeoTitle || p.originalMetaDescription || p.currentMetafields || p.currentTags),
      syncedAt: p.syncedAt?.toISOString() || null,
      error: p.error,
    })),
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const { id } = params;
  const formData = await request.formData();
  const action = formData.get("action");

  if (!id) {
    return json({ error: "Job ID required", success: false });
  }

  // Scoped to the authenticated shop — a job UUID alone must not grant access
  const jobRecord = await prisma.job.findFirst({ where: { id, shop } });
  if (!jobRecord) {
    return json({ error: "Job not found", success: false });
  }

  if (action === "sync") {
    const selectAll = formData.get("selectAll") === "true";
    let productIds = formData.getAll("productIds") as string[];
    const syncMetafields = formData.get("syncMetafields") === "true";
    const syncTags = formData.get("syncTags") === "true";
    const syncAltText = formData.get("syncAltText") === "true";
    const syncDescription = formData.get("syncDescription") === "true";
    const editsJson = formData.get("edits") as string;
    let edits: Record<string, {
      metafields?: Record<string, string>;
      tags?: string[];
      alt_text?: string;
      description?: string;
      seo_title?: string;
      meta_description?: string;
    }> = {};
    if (editsJson) {
      try {
        edits = JSON.parse(editsJson);
      } catch {
        return json({ error: "Invalid edits data", success: false });
      }
    }

    // Server-selected batch for "Apply to Shopify" (auto-chained by the client).
    // error: null is the chain-termination guarantee: products that fail a sync
    // keep status ANALYZED but get error set, dropping them from later batches.
    if (selectAll) {
      const batch = await prisma.product.findMany({
        where: { jobId: id, status: "ANALYZED", error: null },
        orderBy: { createdAt: "asc" },
        take: SYNC_BATCH_SIZE,
        select: { id: true },
      });
      productIds = batch.map((b) => b.id);
    }

    if (productIds.length === 0) {
      return json({
        error: selectAll ? "No products ready to apply" : "No products selected",
        success: false,
      });
    }

    // Import services
    const { updateProductMetafields } = await import(
      "../services/metafields.server"
    );
    const { updateProductTags, updateProductImageAlt, updateProductDescriptionAndSeo, fetchProductSyncState } = await import("../services/products.server");
    const { readTagSchema, mergeTags } = await import("../services/tagSchema.server");

    // Tag settings come from the job snapshot, not live ShopSettings: this scan's
    // suggestions were generated against that schema, so it is also the schema
    // that defines which tag keys we own when merging.
    const jobTagFormat = jobRecord.tagFormat === "KEY_VALUE" ? "KEY_VALUE" : "FREEFORM";
    const jobTagSchema = readTagSchema(jobRecord.tagSchema);

    let synced = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    for (const productId of productIds) {
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      if (!product || product.status !== "ANALYZED") {
        logger.warn("SYNC_PRODUCT_SKIPPED", { shop, productId, reason: !product ? "not_found" : "not_analyzed", status: product?.status });
        continue;
      }

      // Read the product's live state before overwriting it. Two things need it:
      // the original description/SEO snapshot for revert (captured once), and the
      // live tag list, which we merge into rather than replace. Skipped only when
      // neither is needed, i.e. a metafield-only re-apply.
      const needsOriginals =
        !product.originalDescription && !product.originalSeoTitle && !product.originalMetaDescription;
      let liveTags: string[] | null = null;

      if (syncTags || needsOriginals) {
        try {
          const currentData = await fetchProductSyncState(admin, productId);
          liveTags = currentData.tags;
          if (needsOriginals) {
            await prisma.product.update({
              where: { id: productId },
              data: {
                originalDescription: currentData.descriptionHtml,
                originalSeoTitle: currentData.seoTitle,
                originalMetaDescription: currentData.metaDescription,
              },
            });
          }
        } catch (e) {
          logger.warn("ORIGINAL_DATA_CAPTURE_FAILED", { productId, error: e instanceof Error ? e.message : String(e) });
        }
      }

      const originalMetafields = product.suggestedMetafields as Record<
        string,
        string
      > | null;
      const originalTags = product.suggestedTags as string[] | null;

      // Merge edits with original suggestions
      const productEdits = edits[productId];
      const suggestedMetafields = productEdits?.metafields
        ? { ...originalMetafields, ...productEdits.metafields }
        : originalMetafields;
      const suggestedTags = productEdits?.tags ?? originalTags;
      const altText = productEdits?.alt_text ?? originalMetafields?.alt_text;

      let metaSuccess = true;
      let tagSuccess = true;
      let altTextSuccess = true;
      let descSuccess = true;
      let metaError: string | undefined;
      let tagError: string | undefined;
      let altTextError: string | undefined;
      let descError: string | undefined;

      // Sync metafields (exclude alt_text from metafields sync)
      if (syncMetafields && suggestedMetafields) {
        const { alt_text: _, ...metafieldsWithoutAlt } = suggestedMetafields;
        logger.info("SYNC_METAFIELDS_START", { shop, productId, title: product.title });
        const result = await updateProductMetafields(
          admin,
          productId,
          metafieldsWithoutAlt
        );
        metaSuccess = result.success;
        metaError = result.error;
        if (!metaSuccess) {
          logger.error("SYNC_METAFIELDS_FAILED", { shop, productId, title: product.title, error: metaError });
        }
      }

      // Sync tags.
      //
      // productUpdate replaces a product's whole tag list, so the merged list is
      // computed here: schema-owned keys are updated in place and every other
      // merchant tag survives. If the live tag read failed we refuse to write
      // rather than fall back to replacing, which would destroy tags we do not own.
      // An empty list is not a request to clear tags: it means the scan produced
      // nothing usable (every proposed value fell outside the schema, say). There
      // is nothing to write, and writing anyway would only burn an API call.
      let appliedTags: string[] | null = null;
      if (syncTags && suggestedTags && suggestedTags.length > 0) {
        if (liveTags === null) {
          tagSuccess = false;
          tagError = "Could not read the product's current tags";
          logger.error("SYNC_TAGS_FAILED", { shop, productId, title: product.title, error: tagError });
        } else {
          const mergedTags = mergeTags({
            existing: liveTags,
            incoming: suggestedTags,
            format: jobTagFormat,
            schema: jobTagSchema,
          });
          logger.info("SYNC_TAGS_START", { shop, productId, title: product.title, format: jobTagFormat, tagCount: mergedTags.length });
          const result = await updateProductTags(admin, productId, mergedTags);
          tagSuccess = result.success;
          tagError = result.error;
          if (tagSuccess) {
            appliedTags = mergedTags;
          } else {
            logger.error("SYNC_TAGS_FAILED", { shop, productId, title: product.title, error: tagError });
          }
        }
      }

      // Sync alt text (use edited alt text if available)
      if (syncAltText && altText) {
        logger.info("SYNC_ALT_TEXT_START", { shop, productId, title: product.title });
        const result = await updateProductImageAlt(
          admin,
          productId,
          altText
        );
        altTextSuccess = result.success;
        altTextError = result.error;
        if (!altTextSuccess) {
          logger.error("SYNC_ALT_TEXT_FAILED", { shop, productId, title: product.title, error: altTextError });
        }
      }

      // Sync description & SEO
      if (syncDescription) {
        const description = productEdits?.description ?? product.suggestedDescription;
        const seoTitle = productEdits?.seo_title ?? product.suggestedSeoTitle;
        const metaDescription = productEdits?.meta_description ?? product.suggestedMetaDescription;

        if (description || seoTitle || metaDescription) {
          logger.info("SYNC_DESCRIPTION_SEO_START", { shop, productId, title: product.title });
          const result = await updateProductDescriptionAndSeo(
            admin,
            productId,
            description,
            seoTitle,
            metaDescription
          );
          descSuccess = result.success;
          descError = result.error;
          if (!descSuccess) {
            logger.error("SYNC_DESCRIPTION_SEO_FAILED", { shop, productId, title: product.title, error: descError });
          }
        }
      }

      // Record the tag write whether or not the rest of the sync succeeded: revert
      // undoes the delta we actually made, so it has to know about a tag write
      // that landed alongside a failed metafield write. currentTags is refreshed
      // to the live pre-apply list so it stays the "before our change" snapshot
      // revert compares against.
      const tagWriteData =
        appliedTags && liveTags
          ? { appliedTags, currentTags: liveTags.join(", ") }
          : {};

      if (metaSuccess && tagSuccess && altTextSuccess && descSuccess) {
        await prisma.product.update({
          where: { id: productId },
          data: {
            ...tagWriteData,
            status: "SYNCED",
            syncedAt: new Date(),
            error: null,
          },
        });
        synced++;
      } else {
        errors++;
        const errMsg = [metaError, tagError, altTextError, descError].filter(Boolean).join("; ");
        errorMessages.push(`${product.title}: ${errMsg}`);
        // Store error in database
        await prisma.product.update({
          where: { id: productId },
          data: {
            ...tagWriteData,
            error: errMsg,
          },
        });
      }
    }

    const message = errors > 0 && errorMessages.length > 0
      ? `Applied ${synced} products, ${errors} failed: ${errorMessages[0]}`
      : `Applied ${synced} products${errors > 0 ? `, ${errors} failed` : ""}`;

    logger.info("SYNC_COMPLETE", { shop, jobId: id, synced, errors, errorCount: errorMessages.length });

    // Track journey milestone: first sync + total synced
    if (synced > 0) {
      const syncNow = new Date();
      await prisma.shopSettings.updateMany({
        where: { shop, firstSyncAt: null },
        data: { firstSyncAt: syncNow },
      });
      await prisma.shopSettings.update({
        where: { shop },
        data: {
          totalSynced: { increment: synced },
          lastActiveAt: syncNow,
        },
      });
    }

    // How many are still applicable — drives the client's auto-chain
    const remaining = await prisma.product.count({
      where: { jobId: id, status: "ANALYZED", error: null },
    });

    return json({
      success: true,
      synced,
      errors,
      remaining,
      message,
      errorDetails: errorMessages,
    });
  }

  if (action === "retry-failed") {
    if (jobRecord.status === "QUEUED" || jobRecord.status === "PROCESSING") {
      return json({ error: "Scan is still in progress", success: false });
    }

    const failed = await prisma.product.findMany({
      where: { jobId: id, status: "ERROR" },
    });

    if (failed.length === 0) {
      return json({ error: "No failed products to retry", success: false });
    }

    // Reset failed products and put the job back in PROCESSING. The update
    // also refreshes updatedAt, protecting from the 15-min stale-job sweep.
    await prisma.$transaction([
      prisma.product.updateMany({
        where: { jobId: id, status: "ERROR" },
        data: { status: "PENDING", error: null },
      }),
      prisma.job.update({
        where: { id },
        data: {
          status: "PROCESSING",
          processed: Math.max(0, jobRecord.totalItems - failed.length),
        },
      }),
    ]);

    // Retried products keep the job's industry; language is passed only when
    // explicitly set (auto-detect needs the scan-time locale lookup, and a
    // retry prompt without it just defaults to English like the original
    // fallback). vendor is not stored on Product rows, so it is omitted.
    const settings = await prisma.shopSettings.findUnique({
      where: { shop },
      select: { language: true },
    });
    const langSetting = settings?.language ?? "auto";
    const languageForPrompt =
      langSetting !== "auto" ? LANGUAGE_NAMES[langSetting] || langSetting : undefined;

    const { queueBulkAnalysis } = await import("../services/queue.server");
    try {
      await queueBulkAnalysis(
        id,
        failed.map((p) => ({ id: p.id, imageUrl: p.imageUrl, title: p.title })),
        shop,
        jobRecord.industry ?? undefined,
        languageForPrompt,
        undefined,
        { bullJobIdSuffix: `r${Date.now()}` },
      );
    } catch (queueError) {
      logger.error("RETRY_QUEUE_ERROR", {
        shop,
        jobId: id,
        error: queueError instanceof Error ? queueError.message : String(queueError),
      });
      await prisma.job.update({
        where: { id },
        data: { status: "FAILED" },
      });
      return json({ error: "Failed to queue retry. Please try again.", success: false });
    }

    // Retries never consume credits — the original scan already paid for them.
    logger.info("RETRY_FAILED_QUEUED", { shop, jobId: id, count: failed.length });

    return json({
      success: true,
      retried: failed.length,
      message: `Retrying ${failed.length} failed ${failed.length === 1 ? "product" : "products"} (no credits used)`,
    });
  }

  if (action === "revert-all") {
    const { updateProductMetafields } = await import("../services/metafields.server");
    const { updateProductTags, updateProductDescriptionAndSeo, fetchProductSyncState } = await import("../services/products.server");
    const { revertTags } = await import("../services/tagSchema.server");

    // Anything we wrote to Shopify needs an undo path, including a product whose
    // tag write landed while another field failed - that one stays ANALYZED with
    // an error set, so scoping to SYNCED alone would strand it.
    const syncedProducts = await prisma.product.findMany({
      where: {
        jobId: id!,
        OR: [{ status: "SYNCED" }, { appliedTags: { not: Prisma.DbNull } }],
      },
    });

    let reverted = 0;
    let errors = 0;

    for (const product of syncedProducts) {
      let descSuccess = true;
      let metaSuccess = true;
      let tagSuccess = true;

      // Revert description & SEO (originals are stored as raw HTML)
      if (product.originalDescription || product.originalSeoTitle || product.originalMetaDescription) {
        const result = await updateProductDescriptionAndSeo(
          admin,
          product.id,
          product.originalDescription,
          product.originalSeoTitle,
          product.originalMetaDescription,
          { isHtml: true },
        );
        descSuccess = result.success;
      }

      // Revert metafields
      if (product.currentMetafields) {
        const metafields = product.currentMetafields as Record<string, string>;
        const { alt_text: _, ...metafieldsWithoutAlt } = metafields;
        if (Object.keys(metafieldsWithoutAlt).length > 0) {
          const result = await updateProductMetafields(admin, product.id, metafieldsWithoutAlt);
          metaSuccess = result.success;
        }
      }

      // Revert tags by undoing exactly the delta we applied: drop the tags we
      // added, restore the ones we replaced, and leave anything the merchant
      // changed in the meantime alone. A full replace back to the snapshot would
      // wipe every tag added between apply and revert.
      const appliedTags = product.appliedTags as string[] | null;
      const snapshotTags = product.currentTags
        ? product.currentTags.split(", ").filter(Boolean)
        : [];
      // Products applied before appliedTags existed were written by a version
      // that replaced the whole list with exactly the suggestions, so those are
      // the best available record of what we wrote. Never full-replace back to
      // the snapshot here: when a merchant applied with the Tags box unticked we
      // never touched their tags at all, and a replace would delete everything
      // they have added since.
      const writtenTags = appliedTags ?? (product.suggestedTags as string[] | null);

      if (writtenTags && writtenTags.length > 0) {
        try {
          const live = await fetchProductSyncState(admin, product.id);
          const restored = revertTags({
            live: live.tags,
            applied: writtenTags,
            snapshot: snapshotTags,
          });
          const result = await updateProductTags(admin, product.id, restored);
          tagSuccess = result.success;
        } catch (e) {
          tagSuccess = false;
          logger.warn("REVERT_TAGS_FAILED", { shop, productId: product.id, error: e instanceof Error ? e.message : String(e) });
        }
      }

      if (descSuccess && metaSuccess && tagSuccess) {
        await prisma.product.update({
          where: { id: product.id },
          // appliedTags is cleared so a second revert is a no-op rather than
          // stripping tags the merchant has since re-added by hand.
          data: { status: "ANALYZED", syncedAt: null, appliedTags: Prisma.DbNull },
        });
        reverted++;
      } else {
        errors++;
      }
    }

    logger.info("REVERT_COMPLETE", { shop, jobId: id, reverted, errors });

    return json({
      success: true,
      message: `Reverted ${reverted} products${errors > 0 ? `, ${errors} failed` : ""}`,
      synced: 0,
      reverted,
    });
  }

  return json({ success: false });
};

type ActionData = {
  success: boolean;
  message?: string;
  error?: string;
  synced?: number;
  errors?: number;
  remaining?: number;
  reverted?: number;
  retried?: number;
};

function productDisplayStatus(status: string) {
  switch (status) {
    case "PENDING": return { label: "Scanning...", tone: "info" as const };
    case "ANALYZED": return { label: "Ready", tone: "attention" as const };
    case "SYNCED": return { label: "Applied", tone: "success" as const };
    case "ERROR": return { label: "Failed", tone: "critical" as const };
    default: return { label: status, tone: "info" as const };
  }
}

export default function JobDetail() {
  const { job, products } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const revalidator = useRevalidator();

  const [confirmApply, setConfirmApply] = useState(false);
  // Auto-chain state: ref mirrors the flag so the fetcher effect never acts on
  // a stale closure, and lastHandledData guards against double-firing on the
  // same response object.
  const [chainApplying, setChainApplying] = useState(false);
  const chainApplyingRef = useRef(false);
  const lastHandledData = useRef<ActionData | null>(null);
  const [syncMetafields, setSyncMetafields] = useState(true);
  const [syncTags, setSyncTags] = useState(true);
  const [syncAltText, setSyncAltText] = useState(true);
  const [syncDescription, setSyncDescription] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [newTagInputs, setNewTagInputs] = useState<Record<string, string>>({});

  // Track edits per product
  const [edits, setEdits] = useState<Record<string, {
    metafields?: Record<string, string>;
    tags?: string[];
    alt_text?: string;
    description?: string;
    seo_title?: string;
    meta_description?: string;
  }>>({});

  // Helpers for edits
  const getMetafieldValue = (productId: string, key: string, original: string | undefined) =>
    edits[productId]?.metafields?.[key] ?? original ?? "";
  const getTags = (productId: string, original: string[] | null): string[] =>
    edits[productId]?.tags ?? original ?? [];
  const getAltText = (productId: string, original: string | undefined): string =>
    edits[productId]?.alt_text ?? original ?? "";
  const getDescription = (productId: string, original: string | null | undefined): string =>
    edits[productId]?.description ?? original ?? "";
  const getSeoTitle = (productId: string, original: string | null | undefined): string =>
    edits[productId]?.seo_title ?? original ?? "";
  const getMetaDescription = (productId: string, original: string | null | undefined): string =>
    edits[productId]?.meta_description ?? original ?? "";

  const updateMetafieldEdit = (productId: string, key: string, value: string) => {
    setEdits(prev => ({ ...prev, [productId]: { ...prev[productId], metafields: { ...prev[productId]?.metafields, [key]: value } } }));
  };
  const updateAltTextEdit = (productId: string, value: string) => {
    setEdits(prev => ({ ...prev, [productId]: { ...prev[productId], alt_text: value } }));
  };
  const updateDescriptionEdit = (productId: string, value: string) => {
    setEdits(prev => ({ ...prev, [productId]: { ...prev[productId], description: value } }));
  };
  const updateSeoTitleEdit = (productId: string, value: string) => {
    setEdits(prev => ({ ...prev, [productId]: { ...prev[productId], seo_title: value } }));
  };
  const updateMetaDescriptionEdit = (productId: string, value: string) => {
    setEdits(prev => ({ ...prev, [productId]: { ...prev[productId], meta_description: value } }));
  };

  const addTag = (productId: string, product: typeof products[0]) => {
    const newTag = newTagInputs[productId]?.trim();
    if (!newTag) return;
    const currentTags = getTags(productId, product.suggestedTags);
    if (currentTags.includes(newTag)) return;
    setEdits(prev => ({ ...prev, [productId]: { ...prev[productId], tags: [...currentTags, newTag] } }));
    setNewTagInputs(prev => ({ ...prev, [productId]: "" }));
  };

  const removeTag = (productId: string, tagIndex: number, product: typeof products[0]) => {
    const currentTags = getTags(productId, product.suggestedTags);
    setEdits(prev => ({ ...prev, [productId]: { ...prev[productId], tags: currentTags.filter((_, idx) => idx !== tagIndex) } }));
  };

  const analyzedProducts = products.filter((p) => p.status === "ANALYZED");
  const syncedProducts = products.filter((p) => p.status === "SYNCED");
  const resourceName = { singular: "product", plural: "products" };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(analyzedProducts as { id: string }[]);

  const isSyncing = fetcher.state === "submitting";
  const isProcessing = job.status === "QUEUED" || job.status === "PROCESSING";
  const allSynced = job.syncedCount >= job.totalItems && job.status === "COMPLETED";

  // Auto-refresh while job is processing
  useEffect(() => {
    if (!isProcessing) return;
    const interval = setInterval(() => {
      if (revalidator.state === "idle") revalidator.revalidate();
    }, 3000);
    return () => clearInterval(interval);
  }, [isProcessing, revalidator]);

  // The server selects each batch (ANALYZED products without sync errors),
  // so chaining just resubmits the same form until nothing remains.
  const submitApplyAll = useCallback(() => {
    const formData = new FormData();
    formData.append("action", "sync");
    formData.append("selectAll", "true");
    formData.append("syncMetafields", String(syncMetafields));
    formData.append("syncTags", String(syncTags));
    formData.append("syncAltText", String(syncAltText));
    formData.append("syncDescription", String(syncDescription));
    formData.append("edits", JSON.stringify(edits));
    fetcher.submit(formData, { method: "POST" });
  }, [edits, fetcher, syncMetafields, syncTags, syncAltText, syncDescription]);

  const startApplyAll = useCallback(() => {
    chainApplyingRef.current = true;
    setChainApplying(true);
    submitApplyAll();
  }, [submitApplyAll]);

  // Auto-chain batch sync: after a batch completes, submit the next batch
  // while the server reports remaining applicable products.
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (lastHandledData.current === fetcher.data) return;
    lastHandledData.current = fetcher.data;
    const data = fetcher.data;

    if (data.success && data.reverted && data.reverted > 0) {
      shopify.toast.show(data.message || "Reverted successfully");
      revalidator.revalidate();
      return;
    }

    if (data.success && data.retried && data.retried > 0) {
      // Job is back in PROCESSING; the polling effect takes over from here
      shopify.toast.show(data.message || "Retrying failed products");
      revalidator.revalidate();
      return;
    }

    if (chainApplyingRef.current) {
      const madeProgress = (data.synced ?? 0) > 0;
      const remaining = data.remaining ?? 0;
      if (data.success && madeProgress && remaining > 0) {
        submitApplyAll();
        return;
      }
      chainApplyingRef.current = false;
      setChainApplying(false);
      if (data.success) {
        const failNote = (data.errors ?? 0) > 0 ? `, ${data.errors} failed` : "";
        shopify.toast.show(
          remaining === 0
            ? `All products applied${failNote}`
            : `Apply stopped${failNote}`,
          { isError: !madeProgress && remaining > 0 }
        );
      } else if (data.error) {
        shopify.toast.show(data.error, { isError: true });
      }
      return;
    }

    if (data.success && data.synced && data.synced > 0) {
      shopify.toast.show(data.message || "Applied successfully");
    } else if (data.error) {
      shopify.toast.show(data.error, { isError: true });
    }
  }, [fetcher.state, fetcher.data, shopify, revalidator, submitApplyAll]);

  const handleSyncSelected = () => {
    const formData = new FormData();
    formData.append("action", "sync");
    formData.append("syncMetafields", String(syncMetafields));
    formData.append("syncTags", String(syncTags));
    formData.append("syncAltText", String(syncAltText));
    formData.append("syncDescription", String(syncDescription));
    formData.append("edits", JSON.stringify(edits));
    selectedResources.forEach((id) => formData.append("productIds", id));
    fetcher.submit(formData, { method: "POST" });
  };

  const toggleRow = useCallback((id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const progress = Math.round((job.processed / job.totalItems) * 100);

  const rowMarkup = products.map((product, index) => {
    const isExpanded = expandedRows.has(product.id);
    const isAnalyzed = product.status === "ANALYZED";

    return (
      <IndexTable.Row
        id={product.id}
        key={product.id}
        position={index}
        selected={selectedResources.includes(product.id)}
        disabled={!isAnalyzed}
      >
        <IndexTable.Cell>
          <Thumbnail source={product.imageUrl} alt={product.title} size="small" />
        </IndexTable.Cell>
        <IndexTable.Cell>
          <BlockStack gap="100">
            <Text variant="bodyMd" fontWeight="semibold" as="span">{product.title}</Text>
            {product.currentCategory && (
              <Text variant="bodySm" tone="subdued" as="span">{product.currentCategory}</Text>
            )}
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={productDisplayStatus(product.status).tone}>
            {productDisplayStatus(product.status).label}
          </Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {isAnalyzed && (
            <Button variant="plain" onClick={() => toggleRow(product.id)} ariaExpanded={isExpanded}>
              {isExpanded ? "Hide details" : "Show details"}
            </Button>
          )}
          {product.error && (
            <Text as="span" tone="critical" variant="bodySm">{product.error}</Text>
          )}
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
      title="Scan Results"
      subtitle={[
        `${job.totalItems} products`,
        job.tagFilterLabel,
        job.tagFormat === "KEY_VALUE" ? "Key:Value tags" : null,
      ]
        .filter(Boolean)
        .join(" · ")}
    >
      <TitleBar title="Scan Results" />

      <Box paddingBlockEnd="800">
        <BlockStack gap="500">
          {/* Progress card while processing */}
          {isProcessing && (
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">Scan Status</Text>
                  <Badge tone="info">Scanning...</Badge>
                </InlineStack>
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodyMd">Progress</Text>
                    <Text as="span" variant="bodyMd">{job.processed} / {job.totalItems} products</Text>
                  </InlineStack>
                  <ProgressBar progress={progress} size="small" />
                </BlockStack>
              </BlockStack>
            </Card>
          )}

          {/* Status Banner - shown when scan is complete with ANALYZED products */}
          {!isProcessing && analyzedProducts.length > 0 && (
            <Banner title={`Scan Complete! ${analyzedProducts.length} products analyzed.`} tone="success">
              <p>Review the suggestions below, then choose what to apply to your Shopify store.</p>
            </Banner>
          )}

          {/* All synced banner */}
          {allSynced && (
            <Banner title={`All ${job.totalItems} products applied to Shopify`} tone="success">
              <BlockStack gap="300">
                <p>Your products are now enriched with AI-generated data.</p>
                <InlineStack gap="300">
                  <Button
                    variant="plain"
                    tone="critical"
                    onClick={() => {
                      const formData = new FormData();
                      formData.append("action", "revert-all");
                      fetcher.submit(formData, { method: "POST" });
                    }}
                    loading={isSyncing}
                  >
                    Revert All
                  </Button>
                </InlineStack>
              </BlockStack>
            </Banner>
          )}

          {/* Error Summary */}
          {products.filter((p) => p.status === "ERROR").length > 0 && (
            <Banner
              title={`${products.filter((p) => p.status === "ERROR").length} product(s) failed to scan`}
              tone="critical"
            >
              <BlockStack gap="100">
                {products
                  .filter((p) => p.status === "ERROR")
                  .slice(0, 3)
                  .map((p) => (
                    <Text as="p" variant="bodySm" key={p.id}>
                      {p.title}: {p.error || "Unknown error"}
                    </Text>
                  ))}
                {products.filter((p) => p.status === "ERROR").length > 3 && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    And {products.filter((p) => p.status === "ERROR").length - 3} more...
                  </Text>
                )}
                <InlineStack gap="300">
                  <Button
                    onClick={() => {
                      const formData = new FormData();
                      formData.append("action", "retry-failed");
                      fetcher.submit(formData, { method: "POST" });
                    }}
                    loading={isSyncing}
                    disabled={isProcessing || chainApplying}
                  >
                    Retry failed scans (no credits used)
                  </Button>
                </InlineStack>
              </BlockStack>
            </Banner>
          )}

          {/* Sync progress bar during apply (loader revalidates between chained batches) */}
          {(isSyncing || chainApplying) && (
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Applying to Shopify...</Text>
                <ProgressBar
                  progress={Math.round((syncedProducts.length / job.totalItems) * 100)}
                  size="small"
                />
                <Text as="p" variant="bodySm" tone="subdued">
                  {syncedProducts.length}/{job.totalItems} products applied
                </Text>
              </BlockStack>
            </Card>
          )}

          {/* Products Table */}
          <Card padding="0">
            <IndexTable
              resourceName={resourceName}
              itemCount={products.length}
              selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
              onSelectionChange={handleSelectionChange}
              headings={[
                { title: "Image" },
                { title: "Product" },
                { title: "Status" },
                { title: "Details" },
              ]}
              selectable={analyzedProducts.length > 0}
            >
              {rowMarkup}
            </IndexTable>
          </Card>

          {/* Expanded Details */}
          {products.map((product) => {
            if (!expandedRows.has(product.id) || product.status !== "ANALYZED") return null;

            return (
              <Card key={`detail-${product.id}`}>
                <BlockStack gap="400">
                  <Text as="h3" variant="headingMd">{product.title} - AI Suggestions</Text>

                  <Layout>
                    <Layout.Section variant="oneHalf">
                      <BlockStack gap="300">
                        <Text as="h4" variant="headingSm">Suggested Metafields</Text>
                        {product.suggestedMetafields ? (
                          <BlockStack gap="200">
                            {Object.entries(product.suggestedMetafields)
                              .filter(([key]) => key !== "alt_text")
                              .map(([key, value]) => (
                                <TextField
                                  key={key}
                                  label={key.replace(/_/g, " ")}
                                  value={getMetafieldValue(product.id, key, value)}
                                  onChange={(newValue) => updateMetafieldEdit(product.id, key, newValue)}
                                  autoComplete="off"
                                  size="slim"
                                />
                              ))}
                          </BlockStack>
                        ) : (
                          <Text as="p" variant="bodySm" tone="subdued">No metafields suggested</Text>
                        )}

                        {(product.suggestedMetafields?.alt_text || edits[product.id]?.alt_text) && (
                          <BlockStack gap="200">
                            <Divider />
                            <TextField
                              label="Alt Text"
                              value={getAltText(product.id, product.suggestedMetafields?.alt_text)}
                              onChange={(newValue) => updateAltTextEdit(product.id, newValue)}
                              autoComplete="off"
                              multiline={2}
                              helpText="Max 125 characters for accessibility"
                            />
                          </BlockStack>
                        )}
                      </BlockStack>
                    </Layout.Section>

                    <Layout.Section variant="oneHalf">
                      <BlockStack gap="300">
                        <Text as="h4" variant="headingSm">Suggested Tags</Text>
                        <InlineStack gap="100" wrap>
                          {getTags(product.id, product.suggestedTags).map((tag, i) => (
                            <Tag key={i} onRemove={() => removeTag(product.id, i, product)}>{tag}</Tag>
                          ))}
                        </InlineStack>

                        <InlineStack gap="200" blockAlign="end">
                          <div style={{ flex: 1 }}>
                            <TextField
                              label="Add tag"
                              labelHidden
                              placeholder="Add new tag..."
                              value={newTagInputs[product.id] || ""}
                              onChange={(value) => setNewTagInputs(prev => ({ ...prev, [product.id]: value }))}
                              autoComplete="off"
                              size="slim"
                              connectedRight={<Button onClick={() => addTag(product.id, product)}>Add</Button>}
                            />
                          </div>
                        </InlineStack>

                        {product.currentTags && (
                          <>
                            <Divider />
                            <Text as="h4" variant="headingSm">Current Tags</Text>
                            <Text as="p" variant="bodySm" tone="subdued">{product.currentTags || "None"}</Text>
                          </>
                        )}
                      </BlockStack>
                    </Layout.Section>
                  </Layout>

                  {(product.suggestedDescription || product.suggestedSeoTitle || product.suggestedMetaDescription) && (
                    <>
                      <Divider />
                      <Text as="h4" variant="headingSm">Description & SEO</Text>
                      <BlockStack gap="200">
                        {product.suggestedDescription != null && (
                          <TextField
                            label="Product Description"
                            value={getDescription(product.id, product.suggestedDescription)}
                            onChange={(v) => updateDescriptionEdit(product.id, v)}
                            autoComplete="off"
                            multiline={4}
                            helpText="Syncs to your product's main description"
                          />
                        )}
                        {product.suggestedSeoTitle != null && (
                          <TextField
                            label="SEO Title"
                            value={getSeoTitle(product.id, product.suggestedSeoTitle)}
                            onChange={(v) => updateSeoTitleEdit(product.id, v)}
                            autoComplete="off"
                            helpText={`${getSeoTitle(product.id, product.suggestedSeoTitle).length}/70 characters`}
                          />
                        )}
                        {product.suggestedMetaDescription != null && (
                          <TextField
                            label="Meta Description"
                            value={getMetaDescription(product.id, product.suggestedMetaDescription)}
                            onChange={(v) => updateMetaDescriptionEdit(product.id, v)}
                            autoComplete="off"
                            multiline={2}
                            helpText={`${getMetaDescription(product.id, product.suggestedMetaDescription).length}/160 characters`}
                          />
                        )}
                      </BlockStack>
                    </>
                  )}
                </BlockStack>
              </Card>
            );
          })}

          {/* Apply to Shopify Card - shown when there are analyzed products */}
          {analyzedProducts.length > 0 && (
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">Apply to Shopify</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Choose what to write to your Shopify products. Selected options will overwrite existing data.
                  </Text>
                </BlockStack>

                <BlockStack gap="300">
                  <Checkbox
                    label="Metafields (color, material, etc.)"
                    helpText="Writes AI-suggested values to product metafields"
                    checked={syncMetafields}
                    onChange={(v) => { setSyncMetafields(v); setConfirmApply(false); }}
                  />
                  <Checkbox
                    label="Tags"
                    helpText="Replaces existing product tags with AI-suggested tags"
                    checked={syncTags}
                    onChange={(v) => { setSyncTags(v); setConfirmApply(false); }}
                  />
                  <Checkbox
                    label="Alt Text"
                    helpText="Overwrites image alt text"
                    checked={syncAltText}
                    onChange={(v) => { setSyncAltText(v); setConfirmApply(false); }}
                  />
                  <Checkbox
                    label="Description & SEO"
                    helpText="Overwrites product description, SEO title, and meta description"
                    checked={syncDescription}
                    onChange={(v) => { setSyncDescription(v); setConfirmApply(false); }}
                  />
                </BlockStack>

                {analyzedProducts.length > 50 && (
                  <Banner tone="warning" title="Large batch">
                    <p>You are about to apply changes to {analyzedProducts.length} products. Make sure you have reviewed the suggestions above.</p>
                  </Banner>
                )}

                <Divider />

                <Checkbox
                  label={`I've reviewed the suggestions and want to apply to ${selectedResources.length > 0 && selectedResources.length < analyzedProducts.length ? `${selectedResources.length} selected` : `all ${analyzedProducts.length}`} products`}
                  checked={confirmApply}
                  onChange={setConfirmApply}
                />

                <InlineStack gap="300">
                  <Button
                    variant="primary"
                    onClick={startApplyAll}
                    loading={isSyncing || chainApplying}
                    disabled={!confirmApply || (!syncMetafields && !syncTags && !syncAltText && !syncDescription)}
                  >
                    {isSyncing || chainApplying ? "Applying..." : `Apply to Shopify`}
                  </Button>
                  {selectedResources.length > 0 && selectedResources.length < analyzedProducts.length && (
                    <Button
                      onClick={handleSyncSelected}
                      loading={isSyncing}
                      disabled={!confirmApply || chainApplying || (!syncMetafields && !syncTags && !syncAltText && !syncDescription)}
                    >
                      {`Apply ${selectedResources.length} Selected Only`}
                    </Button>
                  )}
                </InlineStack>
              </BlockStack>
            </Card>
          )}
        </BlockStack>
      </Box>
    </Page>
  );
}
