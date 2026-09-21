"use client"
import { ProfileFrame } from "./profile-frame"
import { ProfileFailure } from "./profile-failure"
export default function ErrorState() { return <ProfileFrame><ProfileFailure reload /></ProfileFrame> }
