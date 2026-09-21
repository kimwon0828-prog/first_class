"use client"
import { ApplicationsFrame } from "./applications-frame"
import { ApplicationsFailure } from "./applications-list"
export default function ErrorState() { return <ApplicationsFrame><ApplicationsFailure reload /></ApplicationsFrame> }
