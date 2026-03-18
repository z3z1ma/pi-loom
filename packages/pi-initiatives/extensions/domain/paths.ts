import { resolve } from "node:path";
import { normalizeInitiativeId } from "./normalize.js";

export interface InitiativePaths {
  rootDir: string;
  initiativesDir: string;
}

export function getInitiativesPaths(cwd: string): InitiativePaths {
  return {
    rootDir: resolve(cwd),
    initiativesDir: "initiative",
  };
}

export function getInitiativeDir(_cwd: string, initiativeId: string): string {
  return `initiative:${normalizeInitiativeId(initiativeId)}`;
}

export function getInitiativeBriefPath(cwd: string, initiativeId: string): string {
  return `${getInitiativeDir(cwd, initiativeId)}:brief`;
}

export function getInitiativeStatePath(cwd: string, initiativeId: string): string {
  return `${getInitiativeDir(cwd, initiativeId)}:state`;
}

export function getInitiativeDecisionsPath(cwd: string, initiativeId: string): string {
  return `${getInitiativeDir(cwd, initiativeId)}:decisions`;
}
