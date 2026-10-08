import { Request, Response } from "express";
import { Model } from "mongoose";
import { asyncHandler } from "./asyncHandler";
import { ApiError } from "./ApiError";
import { logActivity } from "../services/activityLog.service";

interface CrudOptions {
  moduleName: string;
  searchFields?: string[];
  populate?: string | string[];
  defaultSort?: string;
}

/** Generic CRUD handlers for simple admin-managed reference/content models. */
export function createCrudController<T>(model: Model<T>, options: CrudOptions) {
  const list = asyncHandler(async (req: Request, res: Response) => {
    const { search, page = "1", limit = "50", ...filters } = req.query as Record<string, string>;
    const query: Record<string, unknown> = { ...filters };
    if (search && options.searchFields?.length) {
      query.$or = options.searchFields.map((field) => ({ [field]: { $regex: search, $options: "i" } }));
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

    let q = model
      .find(query)
      .sort(options.defaultSort ?? "-createdAt")
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);
    if (options.populate) q = q.populate(options.populate as string);

    const [items, total] = await Promise.all([q, model.countDocuments(query)]);
    res.json({
      success: true,
      data: items,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  });

  const getById = asyncHandler(async (req: Request, res: Response) => {
    let q = model.findById(req.params.id);
    if (options.populate) q = q.populate(options.populate as string);
    const item = await q;
    if (!item) throw new ApiError(404, `${options.moduleName} not found.`);
    res.json({ success: true, data: item });
  });

  const create = asyncHandler(async (req: Request, res: Response) => {
    const item = await model.create(req.body);
    await logActivity(req, { action: `${options.moduleName}_created`, module: options.moduleName, recordId: String(item._id) });
    res.status(201).json({ success: true, data: item });
  });

  const update = asyncHandler(async (req: Request, res: Response) => {
    const item = await model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!item) throw new ApiError(404, `${options.moduleName} not found.`);
    await logActivity(req, { action: `${options.moduleName}_updated`, module: options.moduleName, recordId: String(item._id) });
    res.json({ success: true, data: item });
  });

  const remove = asyncHandler(async (req: Request, res: Response) => {
    const item = await model.findByIdAndDelete(req.params.id);
    if (!item) throw new ApiError(404, `${options.moduleName} not found.`);
    await logActivity(req, { action: `${options.moduleName}_deleted`, module: options.moduleName, recordId: String(item._id) });
    res.json({ success: true, message: `${options.moduleName} deleted.` });
  });

  return { list, getById, create, update, remove };
}
