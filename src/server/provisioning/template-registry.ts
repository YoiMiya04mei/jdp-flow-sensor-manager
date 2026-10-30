import type { VendorTemplate } from "./types";
import { mikrotikTemplate } from "./templates/mikrotik";
import { juniperTemplate } from "./templates/juniper";
import { huaweiTemplate } from "./templates/huawei";
import { ciscoTemplate } from "./templates/cisco";
import { unsupportedVendorTemplate } from "./templates/unsupported";

class TemplateRegistry {
  private static instance: TemplateRegistry;
  private templates: Map<string, VendorTemplate> = new Map();
  private vendorMap: Map<string, VendorTemplate> = new Map();

  private constructor() {
    this.register(mikrotikTemplate);
    this.register(juniperTemplate);
    this.register(huaweiTemplate);
    this.register(ciscoTemplate);
  }

  public static getInstance(): TemplateRegistry {
    if (!TemplateRegistry.instance) {
      TemplateRegistry.instance = new TemplateRegistry();
    }
    return TemplateRegistry.instance;
  }

  public register(template: VendorTemplate): void {
    this.templates.set(template.id, template);
    this.vendorMap.set(template.vendor.toLowerCase(), template);
  }

  public getById(templateId: string): VendorTemplate | undefined {
    return this.templates.get(templateId);
  }

  public getByVendor(vendor: string): VendorTemplate {
    const cleanVendor = vendor.trim().toLowerCase();
    const match = this.vendorMap.get(cleanVendor);
    if (match) {
      return match;
    }
    return unsupportedVendorTemplate;
  }

  public getAll(): VendorTemplate[] {
    return Array.from(this.templates.values());
  }
}

export const templateRegistry = TemplateRegistry.getInstance();

