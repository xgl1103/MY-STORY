<template>
  <div id="app-root">
    <router-view v-slot="{ Component, route }">
      <transition name="fade" mode="out-in">
        <AppLayout v-if="route.meta.tabBar">
          <component :is="Component" />
        </AppLayout>
        <component :is="Component" v-else />
      </transition>
    </router-view>
  </div>
</template>

<script setup>
import AppLayout from '@/components/AppLayout.vue'
</script>

<style>
#app-root {
  width: 100%;
  min-height: 100vh;
}
</style>
